import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'

/**
 * Test-runner stage of the troubleshoot pipeline.
 *
 * - Writes the integration test the diagnosis emitted to
 *   `<workspace>/05-build/app/integration_test/troubleshoots/<reportId>_test.dart`.
 * - Spawns `flutter test <relativePath>` with cwd = 05-build/app.
 * - Captures stdout+stderr, exits when child closes or a hard timeout fires.
 * - Records the outcome on the report and orchestrates retries (max 3).
 *
 * Retries are NOT automatic on this layer: the orchestrator decides whether
 * to re-queue a new diagnosis run (with the failing test output as context)
 * or escalate. This module just returns the result.
 */

const TEST_TIMEOUT_MS = 5 * 60_000

export interface RunTestResult {
  passed: boolean
  exitCode: number | null
  output: string
  testRelPath: string
}

export async function writeTestAndRun(
  deps: CoreDeps,
  args: {
    reportId: string
    workspaceAbs: string
    testRelPathFromDiagnosis: string
    testBody: string
  },
): Promise<RunTestResult> {
  // Normalize the test path so it always lives under
  //   05-build/app/integration_test/troubleshoots/<reportId>_test.dart
  // regardless of what the agent emitted (it could have written
  // `integration_test/troubleshoots/foo.dart` or just `foo.dart`).
  const appRoot = join(args.workspaceAbs, '05-build', 'app')
  const filename = `${args.reportId}_test.dart`
  const testRelPath = join('integration_test', 'troubleshoots', filename).replace(/\\/g, '/')
  const testAbs = join(appRoot, testRelPath)
  mkdirSync(dirname(testAbs), { recursive: true })
  writeFileSync(testAbs, args.testBody, 'utf-8')

  logger.info(
    { reportId: args.reportId, testRelPath, original: args.testRelPathFromDiagnosis },
    'troubleshoot test: file written',
  )

  // Mark the report as 'testing' so the UI can show a spinner.
  await useCases.troubleshoot.markApplying(deps, args.reportId).catch(() => {
    /* the report may already be in applying — fine */
  })
  await deps.storage.patchTroubleshootReport({
    id: args.reportId,
    now: Date.now(),
    status: 'testing',
  })

  return new Promise<RunTestResult>((resolve) => {
    const child = spawn('flutter', ['test', testRelPath], {
      cwd: appRoot,
      env: process.env,
      windowsHide: true,
      shell: process.platform === 'win32',
    })

    let outputBuf = ''
    let resolved = false
    const finish = (passed: boolean, exitCode: number | null): void => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({ passed, exitCode, output: outputBuf, testRelPath })
    }

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignored */
      }
      outputBuf += `\n[runner] test timed out after ${TEST_TIMEOUT_MS}ms\n`
      finish(false, null)
    }, TEST_TIMEOUT_MS)

    child.stdout.on('data', (b: Buffer) => {
      outputBuf += b.toString('utf-8')
    })
    child.stderr.on('data', (b: Buffer) => {
      outputBuf += b.toString('utf-8')
    })
    child.on('error', (err) => {
      outputBuf += `\n[runner] spawn error: ${(err as Error).message}\n`
      finish(false, null)
    })
    child.on('close', (code) => {
      const passed = code === 0
      finish(passed, code)
    })
  })
}

/**
 * Persist the result on the report row and decide next state. Returns the
 * next status so the orchestrator knows what to do.
 */
export async function recordTestOutcome(
  deps: CoreDeps,
  reportId: string,
  result: RunTestResult,
): Promise<'verified' | 'open' | 'escalated'> {
  const report = await deps.storage.getTroubleshootReportById(reportId)
  if (!report) {
    logger.warn({ reportId }, 'recordTestOutcome: report disappeared')
    return 'escalated'
  }
  // attempts: we use report.attemptCount which is incremented on each
  // diagnosis (markDiagnosing). The test is the verification step for
  // attempt N. If the test fails on attempt 3 (>= 3), we escalate.
  const willEscalate = !result.passed && report.attemptCount >= 3
  const next: 'verified' | 'open' | 'escalated' = result.passed
    ? 'verified'
    : willEscalate
      ? 'escalated'
      : 'open'
  await deps.storage.patchTroubleshootReport({
    id: reportId,
    now: Date.now(),
    status: next,
    lastTestOutput: result.output,
  })
  logger.info(
    {
      reportId,
      passed: result.passed,
      exitCode: result.exitCode,
      attempt: report.attemptCount,
      nextStatus: next,
    },
    'troubleshoot test: outcome recorded',
  )
  return next
}
