import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import type {
  ProposedFile,
  RequiredOperatorAction,
  TroubleshootDiagnosis,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'
import { queueDiagnosisRun } from './diagnosis-queue'
import { notifyTroubleshootOutcome, recordEvidence } from './evidence'
import {
  applyMigrationViaMcp,
  openSupabaseMcpForProject,
  resolveSupabaseProjectRef,
} from './supabase-mcp'
import { type RunTestResult, recordTestOutcome, writeTestAndRun } from './test-runner'

export interface SqlApplyResult {
  name: string
  ok: boolean
  detail: string
}

export interface TestResultSummary {
  passed: boolean
  exitCode: number | null
  testRelPath: string
  outputTail: string
  nextStatus: 'verified' | 'open' | 'escalated'
}

export interface ApplyOutcome {
  reportId: string
  status:
    | 'applied-files'
    | 'applied-files-and-sql'
    | 'applied-files-sql-failed'
    | 'verified'
    | 'test-failed-retrying'
    | 'test-failed-escalated'
    | 'no-changes'
    | 'invalid-state'
    | 'no-diagnosis'
    | 'unsafe-path'
    | 'mcp-unavailable'
  filesWritten: string[]
  sqlResults?: SqlApplyResult[]
  testResult?: TestResultSummary
  reason?: string
}

/**
 * Resolve and validate a proposed file path. Rules:
 *
 * - Reject absolute paths (Windows or POSIX). Diagnoses must only target
 *   the workspace.
 * - Reject any `..` segment after normalization — defence in depth even
 *   though the final containment check would also catch it.
 * - The path is treated as workspace-relative. If it starts with a
 *   well-known subroot (04-architecture/, 05-build/, 06-qa/, etc) it is
 *   anchored at the workspace root; otherwise it is anchored under
 *   05-build/app/ (the Flutter source root) since dev agents emit paths
 *   like `lib/features/foo/bar.dart` without the `05-build/app/` prefix.
 * - The fully-resolved path must lie strictly inside the workspace.
 */
const WORKSPACE_SUBROOTS = [
  '01-sales',
  '02-kickoff',
  '03-design',
  '04-architecture',
  '05-build',
  '06-qa',
  '07-handoff',
  '_agent-runs',
  '_troubleshoots',
  'integration_test',
] as const

function resolveProposedFilePath(
  workspaceAbs: string,
  proposedPath: string,
): { ok: true; absolute: string; relative: string } | { ok: false; reason: string } {
  const trimmed = proposedPath.trim()
  if (!trimmed) return { ok: false, reason: 'empty path' }
  if (isAbsolute(trimmed)) {
    return { ok: false, reason: `absolute path not allowed: ${trimmed}` }
  }
  const normalized = normalize(trimmed).replace(/\\/g, '/')
  if (normalized.split('/').includes('..')) {
    return { ok: false, reason: `path contains '..': ${trimmed}` }
  }
  const first = normalized.split('/')[0] ?? ''
  const anchored =
    (WORKSPACE_SUBROOTS as readonly string[]).includes(first) || normalized.startsWith('app/')
      ? normalized
      : join('05-build', 'app', normalized).replace(/\\/g, '/')
  const absolute = resolve(workspaceAbs, anchored)
  const containment = relative(workspaceAbs, absolute)
  if (containment.startsWith('..') || isAbsolute(containment)) {
    return { ok: false, reason: `resolved path escapes workspace: ${trimmed}` }
  }
  return { ok: true, absolute, relative: containment.split(sep).join('/') }
}

async function resolveWorkspaceForReport(
  deps: CoreDeps,
  reportId: string,
): Promise<{ workspace: string; projectId: string } | null> {
  const report = await deps.storage.getTroubleshootReportById(reportId)
  if (!report) return null
  const task = await deps.storage.getTaskById(report.taskId)
  if (!task) return null
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) return null
  return {
    workspace: project.workspacePath ?? workspacePathFor(project.code),
    projectId: project.id,
  }
}

function writeProposedFiles(
  workspaceAbs: string,
  files: ProposedFile[],
): { written: string[]; rejected: Array<{ path: string; reason: string }> } {
  const written: string[] = []
  const rejected: Array<{ path: string; reason: string }> = []
  for (const file of files) {
    const resolved = resolveProposedFilePath(workspaceAbs, file.path)
    if (!resolved.ok) {
      rejected.push({ path: file.path, reason: resolved.reason })
      continue
    }
    try {
      mkdirSync(dirname(resolved.absolute), { recursive: true })
      writeFileSync(resolved.absolute, file.newContent, 'utf-8')
      written.push(resolved.relative)
    } catch (err) {
      rejected.push({ path: file.path, reason: (err as Error).message })
    }
  }
  return { written, rejected }
}

/**
 * Apply only the file changes from a report's diagnosis. SQL migrations
 * and the integration test runner come in 5.2 / 5.3. On any unsafe path
 * we abort BEFORE writing anything else (rollback semantics for the
 * batch — partial writes still leave files on disk, but the report is
 * flagged so the operator sees what failed).
 */
export async function applyDiagnosisFiles(deps: CoreDeps, reportId: string): Promise<ApplyOutcome> {
  const report = await deps.storage.getTroubleshootReportById(reportId)
  if (!report) {
    return {
      reportId,
      status: 'no-diagnosis',
      filesWritten: [],
      reason: 'report not found',
    }
  }
  if (report.status !== 'proposed') {
    return {
      reportId,
      status: 'invalid-state',
      filesWritten: [],
      reason: `report status is ${report.status}; must be 'proposed' to apply`,
    }
  }
  if (!report.diagnosisJson) {
    return {
      reportId,
      status: 'no-diagnosis',
      filesWritten: [],
      reason: 'report has no diagnosis JSON yet',
    }
  }
  let diagnosis: TroubleshootDiagnosis
  try {
    diagnosis = JSON.parse(report.diagnosisJson) as TroubleshootDiagnosis
  } catch {
    return {
      reportId,
      status: 'no-diagnosis',
      filesWritten: [],
      reason: 'diagnosis JSON could not be parsed',
    }
  }
  const ctx = await resolveWorkspaceForReport(deps, reportId)
  if (!ctx) {
    return {
      reportId,
      status: 'invalid-state',
      filesWritten: [],
      reason: 'could not resolve workspace for report',
    }
  }
  const { workspace, projectId } = ctx

  // Pre-flight: validate every path BEFORE writing anything.
  for (const f of diagnosis.proposedFiles) {
    const r = resolveProposedFilePath(workspace, f.path)
    if (!r.ok) {
      logger.warn({ reportId, path: f.path, reason: r.reason }, 'unsafe path rejected')
      return {
        reportId,
        status: 'unsafe-path',
        filesWritten: [],
        reason: r.reason,
      }
    }
  }

  // Transition into 'applying' so the UI shows progress.
  const marked = await useCases.troubleshoot.markApplying(deps, reportId)
  if (!marked.ok) {
    return {
      reportId,
      status: 'invalid-state',
      filesWritten: [],
      reason: `markApplying failed: ${JSON.stringify(marked.error)}`,
    }
  }
  await recordEvidence(deps, workspace, reportId, { at: Date.now(), kind: 'applying' })

  // Write files first (if any).
  let filesWritten: string[] = []
  let filesRejected: Array<{ path: string; reason: string }> = []
  if (diagnosis.proposedFiles.length > 0) {
    const r = writeProposedFiles(workspace, diagnosis.proposedFiles)
    filesWritten = r.written
    filesRejected = r.rejected
    logger.info(
      { reportId, written: filesWritten.length, rejected: filesRejected.length },
      'troubleshoot: applied file changes',
    )
    if (filesRejected.length > 0) {
      logger.warn({ reportId, rejected: filesRejected }, 'troubleshoot: some files were rejected')
    }
    await recordEvidence(deps, workspace, reportId, {
      at: Date.now(),
      kind: 'files-written',
      detail: `${filesWritten.length} written, ${filesRejected.length} rejected`,
      data: { written: filesWritten, rejected: filesRejected },
    })
  }

  // Apply SQL migrations via Supabase MCP (if any). When the MCP is not
  // connected for this project we cannot apply SQL end-to-end, so we park
  // the report in `awaiting-operator` with actionable steps (connect the
  // MCP / add secrets, plus each migration's SQL as a manual fallback)
  // instead of escalating with an opaque log. Marking those done flips the
  // report back to `proposed` so the operator can re-run Apply.
  let sqlResults: SqlApplyResult[] | undefined
  if (diagnosis.proposedSql.length > 0) {
    const sqlOutcome = await applyProposedSql(deps, reportId, projectId, diagnosis)
    if (sqlOutcome.kind === 'mcp-unavailable') {
      await deps.storage.patchTroubleshootReport({
        id: reportId,
        now: Date.now(),
        status: 'awaiting-operator',
        requiredActionsJson: JSON.stringify(sqlOutcome.actions),
      })
      await recordEvidence(deps, workspace, reportId, {
        at: Date.now(),
        kind: 'escalated',
        detail: 'Supabase MCP not connected — operator actions required to apply SQL',
        data: { actions: sqlOutcome.actions.map((a) => a.title) },
      })
      await notifyTroubleshootOutcome(deps, reportId, 'escalated')
      return {
        reportId,
        status: 'mcp-unavailable',
        filesWritten,
        reason: `Supabase MCP not connected; ${sqlOutcome.actions.length} operator action(s) required`,
      }
    }
    sqlResults = sqlOutcome.results
    await recordEvidence(deps, workspace, reportId, {
      at: Date.now(),
      kind: 'sql-applied',
      detail: `${sqlResults.filter((r) => r.ok).length}/${sqlResults.length} migrations ok`,
      data: { results: sqlResults },
    })
  }

  // Decide consolidated outcome.
  const filesOnly = filesWritten.length > 0 && !sqlResults
  const sqlOk = sqlResults?.every((r) => r.ok) ?? true
  const sqlFailed = sqlResults && !sqlOk

  if (filesWritten.length === 0 && (!sqlResults || sqlResults.length === 0)) {
    return { reportId, status: 'no-changes', filesWritten: [] }
  }

  if (sqlFailed) {
    // Escalate so the operator inspects.
    await deps.storage.patchTroubleshootReport({
      id: reportId,
      now: Date.now(),
      status: 'escalated',
      lastTestOutput: formatSqlResultsForLog(sqlResults!),
    })
    await recordEvidence(deps, workspace, reportId, {
      at: Date.now(),
      kind: 'escalated',
      detail: 'one or more SQL migrations failed',
    })
    await notifyTroubleshootOutcome(deps, reportId, 'escalated')
    return {
      reportId,
      status: 'applied-files-sql-failed',
      filesWritten,
      sqlResults,
      reason: `${sqlResults!.filter((r) => !r.ok).length} migration(s) failed; report escalated`,
    }
  }

  // Stage 3: run the integration test the diagnosis emitted. If it
  // passes, the report is verified. If it fails AND we still have
  // retries left, re-queue the diagnosis with the failing test output
  // as context. If it fails on attempt 3, escalate.
  const testStage = await runIntegrationTestStage(deps, reportId, workspace, diagnosis)
  if (testStage) {
    return {
      reportId,
      status:
        testStage.nextStatus === 'verified'
          ? 'verified'
          : testStage.nextStatus === 'escalated'
            ? 'test-failed-escalated'
            : 'test-failed-retrying',
      filesWritten,
      ...(sqlResults ? { sqlResults } : {}),
      testResult: testStage,
      ...(filesRejected.length > 0
        ? {
            reason: `${filesRejected.length} file(s) rejected: ${filesRejected
              .map((r) => r.path)
              .join(', ')}`,
          }
        : {}),
    }
  }

  return {
    reportId,
    status: filesOnly ? 'applied-files' : 'applied-files-and-sql',
    filesWritten,
    ...(sqlResults ? { sqlResults } : {}),
    ...(filesRejected.length > 0
      ? {
          reason: `${filesRejected.length} file(s) rejected: ${filesRejected
            .map((r) => r.path)
            .join(', ')}`,
        }
      : {}),
  }
}

/**
 * Write the integration test the diagnosis emitted, run it via
 * `flutter test`, record the outcome on the report, and (when failed
 * with retries left) re-queue a fresh diagnosis run.
 *
 * Returns null when the diagnosis has no integration test (shouldn't
 * happen per the system prompt but we guard anyway).
 */
async function runIntegrationTestStage(
  deps: CoreDeps,
  reportId: string,
  workspace: string,
  diagnosis: TroubleshootDiagnosis,
): Promise<TestResultSummary | null> {
  if (!diagnosis.integrationTestDart?.body) {
    logger.warn({ reportId }, 'troubleshoot: diagnosis has no integration test body')
    return null
  }
  let result: RunTestResult
  try {
    result = await writeTestAndRun(deps, {
      reportId,
      workspaceAbs: workspace,
      testRelPathFromDiagnosis: diagnosis.integrationTestDart.path,
      testBody: diagnosis.integrationTestDart.body,
    })
  } catch (err) {
    logger.warn({ reportId, err: (err as Error).message }, 'troubleshoot: test runner crashed')
    return {
      passed: false,
      exitCode: null,
      testRelPath: diagnosis.integrationTestDart.path,
      outputTail: `runner crashed: ${(err as Error).message}`,
      nextStatus: 'escalated',
    }
  }
  const nextStatus = await recordTestOutcome(deps, reportId, result)

  await recordEvidence(deps, workspace, reportId, {
    at: Date.now(),
    kind: result.passed ? 'test-passed' : 'test-failed',
    detail: `exit ${result.exitCode ?? 'null'} (${result.testRelPath})`,
  })

  if (nextStatus === 'open') {
    // Retry: re-queue diagnosis with the failing test output as context.
    // The worker post-run hook will attach the new diagnosis when the
    // agent finishes; the operator then clicks Apply again.
    const runId = await queueDiagnosisRun(deps, reportId)
    logger.info({ reportId, runId }, 'troubleshoot: test failed, re-queued diagnosis for retry')
    // Transition back into 'diagnosing' so the UI shows the spinner.
    await useCases.troubleshoot.markDiagnosing(deps, reportId)
    await recordEvidence(deps, workspace, reportId, { at: Date.now(), kind: 'retrying' })
  } else if (nextStatus === 'verified') {
    await recordEvidence(deps, workspace, reportId, { at: Date.now(), kind: 'verified' })
    await notifyTroubleshootOutcome(deps, reportId, 'verified')
  } else if (nextStatus === 'escalated') {
    await recordEvidence(deps, workspace, reportId, {
      at: Date.now(),
      kind: 'escalated',
      detail: 'integration test failed on final attempt',
    })
    await notifyTroubleshootOutcome(deps, reportId, 'escalated')
  }

  return {
    passed: result.passed,
    exitCode: result.exitCode,
    testRelPath: result.testRelPath,
    outputTail: result.output.slice(-2000),
    nextStatus,
  }
}

type SqlApplyOutcome =
  | { kind: 'applied'; results: SqlApplyResult[] }
  | { kind: 'mcp-unavailable'; actions: RequiredOperatorAction[] }

/**
 * Build the operator actions surfaced when the Supabase MCP is not
 * connected for this project. The first action explains the one-time
 * setup that lets the agent apply SQL end-to-end on the next attempt; the
 * rest carry each migration's SQL so the operator can paste it manually as
 * a fallback. Marking them done flips the report back to `proposed`, so
 * the operator can re-run Apply once the MCP is configured.
 */
function operatorActionsForUnavailableMcp(
  reason: 'no-connection' | 'no-token' | 'spawn-failed' | 'no-project-ref',
  detail: string,
  diagnosis: TroubleshootDiagnosis,
  projectRef: string | null,
): RequiredOperatorAction[] {
  const setupByReason: Record<typeof reason, Omit<RequiredOperatorAction, 'completedAt'>> = {
    'no-connection': {
      title: 'Conecta el MCP de Supabase para este proyecto',
      why: 'Sin un MCP "supabase" habilitado el agente no puede aplicar migraciones por sí mismo.',
      where: 'Proyecto → MCPs → instalar preset "supabase" (ver docs/MCP-SUPABASE-SETUP.md)',
    },
    'no-token': {
      title: 'Agrega el secret SUPABASE_ACCESS_TOKEN',
      why: 'El MCP de Supabase necesita un personal access token (NO el service_role) para autenticar.',
      where:
        'Proyecto → Secrets → SUPABASE_ACCESS_TOKEN (genéralo en supabase.com/dashboard/account/tokens)',
    },
    'no-project-ref': {
      title: 'Agrega SUPABASE_PROJECT_REF',
      why: 'El agente necesita el project ref para saber a qué proyecto remoto aplicar la migración.',
      where: 'Proyecto → Secrets o Env → SUPABASE_PROJECT_REF',
    },
    'spawn-failed': {
      title: 'Revisa la instalación del MCP de Supabase',
      why: `El proceso del MCP no arrancó: ${detail}`,
      where: 'Proyecto → MCPs → verifica command/args del preset "supabase"',
    },
  }
  const sqlEditorLink = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : undefined
  const setup = setupByReason[reason]
  const actions: RequiredOperatorAction[] = [{ ...setup, completedAt: null }]
  for (const migration of diagnosis.proposedSql) {
    actions.push({
      title: `Aplica la migración ${migration.name}`,
      why: `${migration.rationale}\n\n--- SQL ---\n${migration.body}`,
      where: 'Supabase Dashboard → SQL editor → pega el SQL de arriba y ejecuta',
      ...(sqlEditorLink ? { deepLink: sqlEditorLink } : {}),
      verification: 'El agente reintentará aplicar vía MCP cuando marques esto como hecho.',
      completedAt: null,
    })
  }
  return actions
}

async function applyProposedSql(
  deps: CoreDeps,
  reportId: string,
  projectId: string,
  diagnosis: TroubleshootDiagnosis,
): Promise<SqlApplyOutcome> {
  const opened = await openSupabaseMcpForProject(deps, projectId)
  if (!opened.ok) {
    logger.warn(
      { reportId, reason: opened.reason, detail: opened.detail },
      'troubleshoot: Supabase MCP unavailable — surfacing operator actions',
    )
    return {
      kind: 'mcp-unavailable',
      actions: operatorActionsForUnavailableMcp(opened.reason, opened.detail, diagnosis, null),
    }
  }
  const projectRef = await resolveSupabaseProjectRef(deps, projectId)
  if (!projectRef) {
    await opened.resolution.client.close()
    return {
      kind: 'mcp-unavailable',
      actions: operatorActionsForUnavailableMcp(
        'no-project-ref',
        'SUPABASE_PROJECT_REF missing.',
        diagnosis,
        null,
      ),
    }
  }
  const results: SqlApplyResult[] = []
  try {
    for (const migration of diagnosis.proposedSql) {
      try {
        const r = await applyMigrationViaMcp({
          client: opened.resolution.client,
          projectRef,
          name: migration.name,
          body: migration.body,
        })
        results.push({
          name: migration.name,
          ok: r.ok,
          detail: r.text.slice(0, 400),
        })
        if (!r.ok) {
          logger.warn(
            { reportId, migration: migration.name, detail: r.text.slice(0, 200) },
            'troubleshoot: migration apply failed; aborting subsequent migrations',
          )
          break
        }
      } catch (err) {
        results.push({
          name: migration.name,
          ok: false,
          detail: (err as Error).message,
        })
        break
      }
    }
  } finally {
    await opened.resolution.client.close()
  }
  return { kind: 'applied', results }
}

function formatSqlResultsForLog(results: SqlApplyResult[]): string {
  const lines: string[] = ['SQL migration apply results:', '']
  for (const r of results) {
    lines.push(`- ${r.name}: ${r.ok ? 'OK' : 'FAILED'}`)
    if (r.detail) lines.push(`    ${r.detail}`)
  }
  return lines.join('\n')
}
