import { type SpawnOptions, spawn } from 'node:child_process'

export interface SpawnResult {
  ok: boolean
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}

export interface SpawnArgs {
  command: string
  args: ReadonlyArray<string>
  cwd?: string
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  shell?: boolean
}

/**
 * Cross-platform spawn that captures both streams as text and never throws.
 * Returns { ok: exitCode === 0 } plus the full transcript so the caller can
 * decide what to do with non-zero exits or timeouts.
 */
export function runProcess(spec: SpawnArgs): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const started = Date.now()
    const options: SpawnOptions = {
      cwd: spec.cwd,
      env: spec.env,
      shell: spec.shell ?? process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
    const child = spawn(spec.command, spec.args.slice(), options)

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let killed = false

    const timer = spec.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          killed = true
          child.kill('SIGTERM')
          setTimeout(() => {
            if (!child.killed) child.kill('SIGKILL')
          }, 2000)
        }, spec.timeoutMs)
      : null

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr: `${stderr}\n${(err as Error).message}`,
        durationMs: Date.now() - started,
        timedOut,
      })
    })

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer)
      resolve({
        ok: !timedOut && !killed && code === 0,
        exitCode: code,
        signal: signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
      })
    })
  })
}
