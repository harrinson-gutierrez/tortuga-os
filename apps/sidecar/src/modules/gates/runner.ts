import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { GateType } from '@tortuga-os/contracts'
import { logger } from '../../shared/logger'

export type GateStack = 'flutter' | 'nextjs' | 'vite-react' | 'angular' | 'astro' | 'node'

export interface GateExecution {
  gateType: GateType
  status: 'passed' | 'failed' | 'skipped'
  exitCode: number | null
  durationMs: number
  outputPath: string | null
  reason?: string
}

const ANALYZE_TIMEOUT_MS = 3 * 60_000
const BUILD_TIMEOUT_MS = 10 * 60_000
const TEST_TIMEOUT_MS = 5 * 60_000
const INTEGRATION_TIMEOUT_MS = 10 * 60_000

interface GateCommand {
  cmd: string
  args: string[]
  timeoutMs: number
}

export function commandFor(gateType: GateType, stack: GateStack): GateCommand | null {
  if (gateType === 'G1_ANALYZE') {
    if (stack === 'flutter')
      return { cmd: 'flutter', args: ['analyze', '--no-pub'], timeoutMs: ANALYZE_TIMEOUT_MS }
    return { cmd: 'pnpm', args: ['typecheck'], timeoutMs: ANALYZE_TIMEOUT_MS }
  }
  if (gateType === 'G3_BUILD') {
    if (stack === 'flutter')
      return { cmd: 'flutter', args: ['build', 'apk', '--debug'], timeoutMs: BUILD_TIMEOUT_MS }
    return { cmd: 'pnpm', args: ['build'], timeoutMs: BUILD_TIMEOUT_MS }
  }
  // G6_REAL_WORK: unit + widget tests (everything under `test/` except
  // *_golden_test.dart, which lives behind its own gate so a UI tweak
  // doesn't fail the logic tests). Coverage is captured to lcov.info.
  if (gateType === 'G6_REAL_WORK') {
    if (stack === 'flutter') {
      return {
        cmd: 'flutter',
        args: ['test', '--reporter=expanded', '--coverage', '--exclude-tags=golden'],
        timeoutMs: TEST_TIMEOUT_MS,
      }
    }
    return { cmd: 'pnpm', args: ['test'], timeoutMs: TEST_TIMEOUT_MS }
  }
  // G5_FIDELITY: golden tests only. Separate gate so visual regressions
  // surface as their own line in the wizard, not buried inside G6 pass/fail.
  if (gateType === 'G5_FIDELITY') {
    if (stack === 'flutter') {
      return {
        cmd: 'flutter',
        args: ['test', '--reporter=expanded', '--tags=golden'],
        timeoutMs: TEST_TIMEOUT_MS,
      }
    }
    return null
  }
  // G4_BOOT: integration_test smoke. Needs a live device, runs the app
  // end-to-end and asserts it reaches a visible screen.
  if (gateType === 'G4_BOOT') {
    if (stack === 'flutter') {
      return {
        cmd: 'flutter',
        args: ['test', 'integration_test', '--reporter=expanded'],
        timeoutMs: INTEGRATION_TIMEOUT_MS,
      }
    }
    return null
  }
  return null
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  logPath: string,
): Promise<{ exitCode: number | null; output: string; durationMs: number }> {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now()
    const chunks: Buffer[] = []
    // Open a write stream so the UI can tail the file while the gate runs.
    // The stream is kept open until 'close' fires.
    const logStream = createWriteStream(logPath, { flags: 'w' })
    const header = `[gate] $ ${cmd} ${args.join(' ')}\n[gate] cwd: ${cwd}\n[gate] started: ${new Date(startedAt).toISOString()}\n\n`
    logStream.write(header)
    chunks.push(Buffer.from(header, 'utf-8'))
    const child = spawn(cmd, args, {
      cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      const killMsg = `\n[gate] killed after ${timeoutMs}ms\n`
      chunks.push(Buffer.from(killMsg))
      logStream.write(killMsg)
    }, timeoutMs)
    child.stdout?.on('data', (b: Buffer) => {
      chunks.push(b)
      logStream.write(b)
    })
    child.stderr?.on('data', (b: Buffer) => {
      chunks.push(b)
      logStream.write(b)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const footer = `\n[gate] exit: ${code} · duration: ${Date.now() - startedAt}ms\n`
      chunks.push(Buffer.from(footer, 'utf-8'))
      logStream.write(footer)
      logStream.end(() => {
        resolvePromise({
          exitCode: code,
          output: Buffer.concat(chunks).toString('utf8'),
          durationMs: Date.now() - startedAt,
        })
      })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      const errMsg = `[gate] spawn error: ${err.message}`
      logStream.write(errMsg)
      logStream.end(() => {
        resolvePromise({
          exitCode: -1,
          output: errMsg,
          durationMs: Date.now() - startedAt,
        })
      })
    })
  })
}

function buildCwdFor(stack: GateStack, workspacePath: string): string {
  if (stack === 'flutter') return join(workspacePath, '05-build', 'app')
  return workspacePath
}

export async function executeGate(
  gateType: GateType,
  stack: GateStack,
  workspacePath: string,
  taskCode: string,
  iterationN: number,
): Promise<GateExecution> {
  const command = commandFor(gateType, stack)
  if (!command) {
    return {
      gateType,
      status: 'skipped',
      exitCode: null,
      durationMs: 0,
      outputPath: null,
      reason: `gate ${gateType} not implemented for stack ${stack} in MVP`,
    }
  }

  const gateDir = join(workspacePath, '05-build', '_gates', taskCode, `n${iterationN}`)
  mkdirSync(gateDir, { recursive: true })
  const logRel = `05-build/_gates/${taskCode}/n${iterationN}/${gateType}.log`
  const logAbs = join(gateDir, `${gateType}.log`)

  const cwd = buildCwdFor(stack, workspacePath)
  logger.info({ gateType, stack, cwd }, 'gate: started')
  const result = await runCommand(command.cmd, command.args, cwd, command.timeoutMs, logAbs)
  // False-negative recovery: Flutter sometimes returns a non-zero exit
  // code after Gradle/Kotlin incremental-cache shutdown errors, but the
  // APK was already built successfully. If we can prove that line in the
  // log, treat the gate as passed.
  const isBuild = gateType === 'G3_BUILD'
  const apkBuilt =
    isBuild &&
    /Built\s+build[\\/]app[\\/]outputs[\\/]flutter-apk[\\/]app-debug\.apk/i.test(result.output)
  const status: GateExecution['status'] = result.exitCode === 0 || apkBuilt ? 'passed' : 'failed'
  logger.info(
    {
      gateType,
      status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      apkBuilt: apkBuilt || undefined,
    },
    'gate: closed',
  )

  return {
    gateType,
    status,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    outputPath: logRel,
  }
}
