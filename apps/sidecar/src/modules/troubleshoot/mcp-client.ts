import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { logger } from '../../shared/logger'

/**
 * Minimal MCP stdio client.
 *
 * Speaks JSON-RPC 2.0 over the child process' stdin/stdout. The MCP
 * spec uses newline-delimited JSON messages on stdio (not LSP-style
 * Content-Length framing — that variant is for stdio transports
 * targeting language servers). One JSON object per line.
 *
 * Lifecycle:
 *   1. spawn the MCP server with its env
 *   2. send `initialize` and await response
 *   3. send `notifications/initialized`
 *   4. call `tools/call` as needed
 *   5. close — kills the child and resolves all pending promises with an error
 *
 * This is deliberately self-contained (no SDK) so the bundle stays small
 * and we don't ship the entire MCP SDK transitive dep tree.
 */

export interface McpClientOptions {
  command: string
  args: string[]
  env: Record<string, string>
  cwd?: string
  /** Hard cap per request. Default 60s. */
  requestTimeoutMs?: number
}

export interface ToolCallResult {
  ok: boolean
  /** Concatenated text from `content[].text` blocks. */
  text: string
  /** Raw `content` array as the server returned it. */
  raw: unknown
  /** Set when the server reported `isError: true`. */
  isError: boolean
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const DEFAULT_TIMEOUT = 60_000

export class McpClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private stdoutBuf = ''
  private initialized = false
  private closed = false
  private readonly opts: Required<Omit<McpClientOptions, 'cwd'>> & {
    cwd?: string
  }

  constructor(opts: McpClientOptions) {
    this.opts = {
      command: opts.command,
      args: opts.args,
      env: opts.env,
      requestTimeoutMs: opts.requestTimeoutMs ?? DEFAULT_TIMEOUT,
      ...(opts.cwd ? { cwd: opts.cwd } : {}),
    }
  }

  async start(): Promise<void> {
    if (this.child) return
    const child = spawn(this.opts.command, this.opts.args, {
      env: { ...process.env, ...this.opts.env },
      ...(this.opts.cwd ? { cwd: this.opts.cwd } : {}),
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    this.child = child

    child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8').trim()
      if (text) logger.debug({ source: 'mcp-stderr', text }, 'mcp child stderr')
    })
    child.on('error', (err) => {
      logger.warn({ err: err.message }, 'mcp child process error')
      this.failAllPending(new Error(`mcp process error: ${err.message}`))
    })
    child.on('close', (code) => {
      this.closed = true
      this.failAllPending(new Error(`mcp process exited (code=${code})`))
    })

    const initResponse = (await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'tortuga-os-sidecar', version: '0.1.0' },
    })) as { protocolVersion?: string; serverInfo?: { name?: string } } | null
    this.initialized = true
    this.notify('notifications/initialized', {})
    logger.info(
      {
        serverName: initResponse?.serverInfo?.name,
        protocol: initResponse?.protocolVersion,
      },
      'mcp client initialized',
    )
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    if (!this.initialized) throw new Error('mcp client not initialized — call start() first')
    const raw = (await this.send('tools/call', {
      name: toolName,
      arguments: args,
    })) as {
      content?: Array<{ type?: string; text?: string }>
      isError?: boolean
    } | null
    const isError = raw?.isError === true
    const text =
      (raw?.content ?? [])
        .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string)
        .join('\n') ?? ''
    return {
      ok: !isError,
      text,
      raw,
      isError,
    }
  }

  async close(): Promise<void> {
    if (!this.child) return
    this.closed = true
    this.failAllPending(new Error('mcp client closed'))
    try {
      this.child.kill('SIGTERM')
    } catch {
      /* ignored */
    }
    this.child = null
  }

  private send(method: string, params: unknown): Promise<unknown> {
    if (this.closed || !this.child) {
      return Promise.reject(new Error(`mcp client closed (method=${method})`))
    }
    const id = this.nextId++
    const message = { jsonrpc: '2.0', id, method, params }
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`mcp request timed out: ${method}`))
      }, this.opts.requestTimeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.child!.stdin.write(`${JSON.stringify(message)}\n`)
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err as Error)
      }
    })
  }

  private notify(method: string, params: unknown): void {
    if (this.closed || !this.child) return
    const message = { jsonrpc: '2.0', method, params }
    try {
      this.child.stdin.write(`${JSON.stringify(message)}\n`)
    } catch (err) {
      logger.warn({ err: (err as Error).message, method }, 'mcp notify failed')
    }
  }

  private onStdout(chunk: Buffer): void {
    this.stdoutBuf += chunk.toString('utf-8')
    while (true) {
      const idx = this.stdoutBuf.indexOf('\n')
      if (idx < 0) break
      const line = this.stdoutBuf.slice(0, idx).trim()
      this.stdoutBuf = this.stdoutBuf.slice(idx + 1)
      if (!line) continue
      this.onMessage(line)
    }
  }

  private onMessage(line: string): void {
    let parsed: { id?: number; result?: unknown; error?: { message?: string } }
    try {
      parsed = JSON.parse(line) as typeof parsed
    } catch {
      logger.warn({ line: line.slice(0, 200) }, 'mcp non-JSON line ignored')
      return
    }
    if (typeof parsed.id !== 'number') {
      // Notifications/server events we don't need to handle in MVP.
      return
    }
    const pend = this.pending.get(parsed.id)
    if (!pend) {
      logger.debug({ id: parsed.id }, 'mcp response for unknown request id')
      return
    }
    this.pending.delete(parsed.id)
    clearTimeout(pend.timer)
    if (parsed.error) {
      pend.reject(new Error(parsed.error.message ?? 'mcp error'))
    } else {
      pend.resolve(parsed.result ?? null)
    }
  }

  private failAllPending(err: Error): void {
    for (const [, pend] of this.pending) {
      clearTimeout(pend.timer)
      pend.reject(err)
    }
    this.pending.clear()
  }
}
