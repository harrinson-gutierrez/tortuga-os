import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRunCallbacks, AgentRunOutcome, AgentRunSpec, AgentRunner } from './port'

function cryptoRandomUuid(): string {
  return randomUUID()
}

/**
 * Claude Code CLI adapter.
 *
 * Spawns `claude --print --output-format stream-json` with the user
 * prompt on stdin and parses the streamed JSONL events. The CLI must be
 * on the user's PATH (resolved via the TORTUGA_CLAUDE_BIN env or the
 * default 'claude').
 *
 * Output format reference:
 *   https://docs.anthropic.com/en/docs/claude-code/sdk
 *
 * The stream emits typed events (we care about):
 *   { type: 'assistant', message: { content: [{type: 'text', text}] } }
 *   { type: 'user', message: { content: [{type: 'tool_use', name, input}] } }
 *   { type: 'result', subtype: 'success', total_cost_usd, usage }
 *   { type: 'result', subtype: 'error_*', error }
 */

const DEFAULT_BIN = process.env.TORTUGA_CLAUDE_BIN ?? 'claude'
const DEFAULT_MODEL = 'claude-opus-4-7'
const DEFAULT_TIMEOUT_MS = 10 * 60_000
const STALL_MAX_CONSECUTIVE_FAILED = 5
const STALL_NO_OK_WINDOW_MS = 90_000

function pickTargetPath(name: string, input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  if (name === 'Bash' && typeof obj.command === 'string') {
    const cmd = obj.command
    return cmd.length > 120 ? `${cmd.slice(0, 117)}...` : cmd
  }
  for (const key of ['file_path', 'path', 'notebook_path', 'pattern']) {
    const v = obj[key]
    if (typeof v === 'string') return v
  }
  return null
}

function isErrorResult(content: unknown): boolean {
  const text = stringifyResultContent(content)
  if (!text) return false
  const head = text.slice(0, 200)
  return (
    /^Error:/i.test(head) ||
    /^Permission denied/i.test(head) ||
    /^File does not exist/i.test(head) ||
    /^Cannot find/i.test(head) ||
    /^EACCES|^ENOENT|^EPERM/.test(head)
  )
}

function looksLikeFileDump(content: unknown): boolean {
  const text = stringifyResultContent(content)
  if (!text) return false
  const head = text.slice(0, 400)
  return /(^|\n)\s*\d+\s*(→|\t|\s{2,})/.test(head)
}

function extractErrorReason(content: unknown): string {
  const text = stringifyResultContent(content)
  if (!text) return 'sin detalle'
  // Prefer the tail of the message: CLI diagnostics about size limits
  // and quota are usually appended after the partial payload.
  const errLine = text
    .split(/\n+/)
    .reverse()
    .find((l) => /error|exceeds|too large|denied|not found|cannot/i.test(l))
  const picked = errLine ?? text
  const oneLine = picked.replace(/\s+/g, ' ').trim()
  return oneLine.length > 140 ? `${oneLine.slice(0, 137)}...` : oneLine
}

function stringifyResultContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c
        if (c && typeof c === 'object' && typeof (c as { text?: string }).text === 'string') {
          return (c as { text: string }).text
        }
        return ''
      })
      .join('\n')
  }
  return ''
}

export class ClaudeCliRunner implements AgentRunner {
  readonly provider = 'claude-cli' as const
  readonly defaultModel = DEFAULT_MODEL

  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  async run(spec: AgentRunSpec, callbacks: AgentRunCallbacks): Promise<AgentRunOutcome> {
    // We pass the system prompt via a tmp file. As a CLI arg it gets
    // mangled by cmd.exe on Windows (the discovery service hit the same
    // bug). Writing to a file is robust across platforms.
    const promptDir = mkdtempSync(join(tmpdir(), 'tortuga-agent-'))
    const promptFile = join(promptDir, 'system.txt')
    writeFileSync(promptFile, spec.systemPrompt, 'utf-8')

    // Build the Claude CLI --mcp-config payload from the spec's
    // `mcpServers` list. Shape per Claude CLI docs:
    //   { "mcpServers": { "<name>": { "command": "...", "args": [...], "env": {} } } }
    //   { "mcpServers": { "<name>": { "url": "https://...", "headers": {} } } }
    // We only write the file when there's at least one server, so the CLI
    // never sees `--mcp-config` for runs without MCP wiring.
    let mcpConfigFile: string | null = null
    if (spec.mcpServers && spec.mcpServers.length > 0) {
      const mcpServers: Record<string, Record<string, unknown>> = {}
      for (const s of spec.mcpServers) {
        if (s.url) {
          mcpServers[s.name] = {
            type: 'http',
            url: s.url,
            ...(s.headers && Object.keys(s.headers).length > 0 ? { headers: s.headers } : {}),
          }
        } else if (s.command) {
          mcpServers[s.name] = {
            type: 'stdio',
            command: s.command,
            ...(s.args && s.args.length > 0 ? { args: s.args } : {}),
            ...(s.env && Object.keys(s.env).length > 0 ? { env: s.env } : {}),
          }
        }
      }
      if (Object.keys(mcpServers).length > 0) {
        mcpConfigFile = join(promptDir, 'mcp.json')
        writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers }, null, 2), 'utf-8')
      }
    }

    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      // Session id: when the worker passes a deterministic id (same id
      // across roles of a single phase) the CLI's prompt cache survives
      // across runs, cutting input tokens dramatically. When omitted we
      // fall back to a fresh uuid so unrelated runs don't share memory.
      '--session-id',
      spec.sessionId && spec.sessionId.length > 0 ? spec.sessionId : cryptoRandomUuid(),
      // Use --system-prompt-file (replaces the CLI's default coding
      // assistant persona) because --append keeps the default "ask when
      // uncertain / request permission" persona which is incompatible
      // with headless runs.
      '--system-prompt-file',
      promptFile,
      // NOTE: workspace is already the cwd of the spawned process, so we
      // do NOT pass it as --add-dir. Passing both created TWO permitted
      // roots and the model frequently chose the wrong one, producing
      // cascades of "File does not exist" against repo-relative paths
      // like `05-build/app/lib/...` that only exist under the workspace.
      ...(spec.extraReadDirs ?? []).flatMap((d) => ['--add-dir', d]),
      '--model',
      spec.model || this.defaultModel,
      // Run unattended: the CLI is invoked by the sidecar, there is no
      // human at the keyboard to click "approve". `--permission-mode
      // bypassPermissions` is documented as the headless mode but in
      // practice Bash commands like `flutter ...` still get rejected
      // with "This command requires approval". The flag that actually
      // disables every gate is `--dangerously-skip-permissions`. We
      // accept the risk because:
      //   1) the run is sandboxed to the project workspace via --add-dir
      //   2) we block tools that imply a human or escape the sandbox
      '--dangerously-skip-permissions',
      '--disallowedTools',
      // QA is read-only by contract. Even though the system prompt forbids
      // edits, we also block the write tools at the CLI level so a
      // prompt-injection or misbehaving model can't bypass it. Bash stays
      // allowed so the agent can run `flutter analyze` for cross-checking.
      spec.agentKind === 'qa'
        ? 'AskUserQuestion,Edit,Write,NotebookEdit,PowerShell,RemoteTrigger,PushNotification,ScheduleWakeup,CronCreate,CronDelete,CronList,EnterPlanMode,ExitPlanMode,EnterWorktree,ExitWorktree'
        : 'AskUserQuestion,PowerShell,RemoteTrigger,PushNotification,ScheduleWakeup,CronCreate,CronDelete,CronList,EnterPlanMode,ExitPlanMode,EnterWorktree,ExitWorktree',
    ]
    if (mcpConfigFile) {
      args.push('--mcp-config', mcpConfigFile)
    }

    const child = spawn(DEFAULT_BIN, args, {
      cwd: spec.workspacePath,
      env: { ...process.env, ...(spec.env ?? {}) },
      windowsHide: true,
      shell: process.platform === 'win32',
    })
    this.running.set(spec.runId, child)

    let outputBuf = ''
    let tokensIn = 0
    let tokensOut = 0
    let costCents = 0
    let errorMessage: string | null = null
    let cancelled = false
    let consecutiveFailed = 0
    let lastOkAt = Date.now()

    const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timer = setTimeout(() => {
      cancelled = true
      errorMessage = `Timed out after ${timeoutMs}ms`
      child.kill('SIGTERM')
    }, timeoutMs)

    const killForStall = (reason: string): void => {
      if (cancelled) return
      cancelled = true
      errorMessage = `Stall detected: ${reason}`
      child.kill('SIGTERM')
    }

    const stallWatcher = setInterval(() => {
      if (cancelled) return
      if (Date.now() - lastOkAt > STALL_NO_OK_WINDOW_MS) {
        killForStall(`no successful tool call in ${Math.round(STALL_NO_OK_WINDOW_MS / 1000)}s`)
      }
    }, 10_000)

    // Stream-json mode emits one JSON object per line on stdout.
    let lineBuf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      lineBuf += chunk.toString('utf-8')
      while (true) {
        const idx = lineBuf.indexOf('\n')
        if (idx < 0) break
        const line = lineBuf.slice(0, idx).trim()
        lineBuf = lineBuf.slice(idx + 1)
        if (!line) continue
        try {
          const event = JSON.parse(line) as Record<string, unknown>
          handleEvent(event)
        } catch {
          // Non-JSON line: append raw.
          outputBuf += `${line}\n`
          callbacks.onChunk?.(`${line}\n`)
        }
      }
    })

    // Track tool calls between their `tool_use` (in an assistant event)
    // and their `tool_result` (in the next user event) so we can emit a
    // single line that includes success/failure. The frontend relies on
    // these markers to know what the agent actually changed on disk
    // versus what was rejected/permissions-denied.
    const pendingToolCalls = new Map<string, { name: string; target: string | null }>()

    function handleEvent(event: Record<string, unknown>): void {
      const type = event.type as string | undefined
      if (type === 'assistant') {
        const msg = event.message as
          | {
              content?: Array<{
                type?: string
                text?: string
                name?: string
                input?: unknown
                id?: string
              }>
            }
          | undefined
        for (const part of msg?.content ?? []) {
          if (part.type === 'text' && typeof part.text === 'string') {
            outputBuf += part.text
            callbacks.onChunk?.(part.text)
          } else if (part.type === 'tool_use' && typeof part.name === 'string') {
            // Stash the call. We emit a marker only after the matching
            // tool_result arrives so success/failure is visible.
            if (typeof part.id === 'string') {
              pendingToolCalls.set(part.id, {
                name: part.name,
                target: pickTargetPath(part.name, part.input),
              })
            }
            callbacks.onToolCall?.(part.name, part.input)
          }
        }
        return
      }
      if (type === 'user') {
        const msg = event.message as
          | {
              content?: Array<{
                type?: string
                tool_use_id?: string
                content?: unknown
                is_error?: boolean
              }>
            }
          | undefined
        for (const part of msg?.content ?? []) {
          if (part.type !== 'tool_result' || typeof part.tool_use_id !== 'string') continue
          const call = pendingToolCalls.get(part.tool_use_id)
          if (!call) continue
          pendingToolCalls.delete(part.tool_use_id)
          const explicitError = part.is_error === true || isErrorResult(part.content)
          const failed = explicitError && !looksLikeFileDump(part.content)
          const status = failed ? 'FAILED' : 'OK'
          const reason = failed ? ` — ${extractErrorReason(part.content)}` : ''
          const marker = call.target
            ? `\n[tool:${call.name} ${status}] ${call.target}${reason}\n`
            : `\n[tool:${call.name} ${status}]${reason}\n`
          outputBuf += marker
          callbacks.onChunk?.(marker)
          if (failed) {
            consecutiveFailed++
            if (consecutiveFailed >= STALL_MAX_CONSECUTIVE_FAILED) {
              killForStall(
                `${consecutiveFailed} consecutive tool failures (last: ${call.name} ${call.target ?? ''})`,
              )
            }
          } else {
            consecutiveFailed = 0
            lastOkAt = Date.now()
          }
        }
        return
      }
      if (type === 'result') {
        const usage = event.usage as
          | { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
          | undefined
        if (usage) {
          tokensIn = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
          tokensOut = usage.output_tokens ?? 0
        }
        const cost = event.total_cost_usd as number | undefined
        if (typeof cost === 'number') {
          costCents = Math.round(cost * 100)
        }
        callbacks.onUsage?.({ tokensIn, tokensOut, costCents })
        const subtype = event.subtype as string | undefined
        if (subtype && subtype !== 'success') {
          errorMessage = (event.error as string | undefined) ?? subtype
        }
        return
      }
    }

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8')
      outputBuf += `\n[stderr] ${text}`
      callbacks.onChunk?.(`[stderr] ${text}`)
    })

    // Pass the user message via stdin so the CLI runs in headless mode.
    child.stdin.write(spec.userPrompt)
    child.stdin.end()

    return new Promise<AgentRunOutcome>((resolve) => {
      child.on('close', (code) => {
        clearTimeout(timer)
        clearInterval(stallWatcher)
        this.running.delete(spec.runId)
        if (cancelled) {
          resolve({
            kind: 'cancelled',
            output: outputBuf,
            tokensIn,
            tokensOut,
            costCents,
          })
          return
        }
        if (code === 0 && !errorMessage) {
          resolve({ kind: 'succeeded', output: outputBuf, tokensIn, tokensOut, costCents })
          return
        }
        resolve({
          kind: 'failed',
          errorMessage: errorMessage ?? `claude exited with code ${code}`,
          output: outputBuf,
          tokensIn,
          tokensOut,
          costCents,
        })
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        clearInterval(stallWatcher)
        this.running.delete(spec.runId)
        resolve({
          kind: 'failed',
          errorMessage: (err as Error).message,
          output: outputBuf,
          tokensIn,
          tokensOut,
          costCents,
        })
      })
    })
  }

  cancel(runId: string): void {
    const child = this.running.get(runId)
    if (!child) return
    child.kill('SIGTERM')
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL')
    }, 2000)
  }
}
