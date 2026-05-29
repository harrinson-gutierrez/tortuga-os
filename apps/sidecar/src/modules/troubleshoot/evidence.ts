import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TroubleshootDiagnosis, TroubleshootReportDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'

export type TimelineEventKind =
  | 'created'
  | 'diagnosing'
  | 'diagnosed'
  | 'applying'
  | 'files-written'
  | 'sql-applied'
  | 'test-passed'
  | 'test-failed'
  | 'retrying'
  | 'escalated'
  | 'verified'
  | 'resolved'
  | 'dismissed'

export interface TimelineEvent {
  at: number
  kind: TimelineEventKind
  detail?: string
  data?: Record<string, unknown>
}

function evidenceDir(workspaceAbs: string, reportId: string): string {
  const dir = join(workspaceAbs, '05-build', '_troubleshoots', reportId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Append a single event to the report's `timeline.jsonl`. Each line is a
 * self-contained JSON object so the file can be tailed or replayed without
 * parsing the whole document. Never throws — evidence is best-effort and
 * must not break the troubleshoot pipeline.
 */
export function appendTimelineEvent(
  workspaceAbs: string,
  reportId: string,
  event: Omit<TimelineEvent, 'at'> & { at: number },
): void {
  try {
    const dir = evidenceDir(workspaceAbs, reportId)
    const line = `${JSON.stringify(event)}\n`
    appendFileSync(join(dir, 'timeline.jsonl'), line, 'utf-8')
  } catch (err) {
    logger.warn(
      { reportId, err: (err as Error).message },
      'troubleshoot evidence: failed to append timeline event',
    )
  }
}

function diagnosisSection(diagnosis: TroubleshootDiagnosis | null): string[] {
  if (!diagnosis) return ['## Diagnosis', '', '_No diagnosis was produced._', '']
  const lines: string[] = ['## Diagnosis', '']
  lines.push(`**Root cause:** ${diagnosis.rootCause}`, '')
  lines.push(`**Confidence:** ${diagnosis.confidence}`, '')
  if (diagnosis.proposedFiles.length > 0) {
    lines.push('### Proposed files', '')
    for (const f of diagnosis.proposedFiles) {
      lines.push(`- \`${f.path}\` — ${f.rationale}`)
    }
    lines.push('')
  }
  if (diagnosis.proposedSql.length > 0) {
    lines.push('### Proposed SQL', '')
    for (const s of diagnosis.proposedSql) {
      lines.push(`- **${s.name}** — ${s.rationale}`)
    }
    lines.push('')
  }
  if (diagnosis.requiredOperatorActions.length > 0) {
    lines.push('### Required operator actions', '')
    for (const a of diagnosis.requiredOperatorActions) {
      const done = a.completedAt ? 'x' : ' '
      lines.push(`- [${done}] **${a.title}** — ${a.why} (${a.where})`)
    }
    lines.push('')
  }
  if (diagnosis.manualValidationSteps.length > 0) {
    lines.push('### Manual validation steps', '')
    diagnosis.manualValidationSteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`))
    lines.push('')
  }
  return lines
}

function screenshotSection(report: TroubleshootReportDTO): string[] {
  const lines: string[] = ['## Screenshots', '']
  if (report.beforeScreenshotPath) {
    lines.push('**Before:**', '', '![before](./before.png)', '')
  }
  if (report.afterScreenshotPath) {
    lines.push('**After:**', '', '![after](./after.png)', '')
  }
  if (!report.beforeScreenshotPath && !report.afterScreenshotPath) {
    lines.push('_No screenshots were captured._', '')
  }
  return lines
}

/**
 * Render the full `report.md` for a troubleshoot report and write it to the
 * evidence directory. Idempotent — always overwrites with the latest state,
 * so it can be re-rendered after every status transition.
 */
export function writeReportMarkdown(
  workspaceAbs: string,
  report: TroubleshootReportDTO,
  timeline: TimelineEvent[],
): void {
  try {
    const dir = evidenceDir(workspaceAbs, report.id)
    const lines: string[] = [
      `# Troubleshoot report ${report.id}`,
      '',
      `- **Status:** ${report.status}`,
      `- **Task:** ${report.taskId}`,
      `- **Attempts:** ${report.attemptCount}`,
      report.parentReportId ? `- **Supersedes:** ${report.parentReportId}` : '',
      '',
      '## Error',
      '',
      '```',
      report.errorText,
      '```',
      '',
    ]
    if (report.contextNote) {
      lines.push('## Context note', '', report.contextNote, '')
    }
    lines.push(...diagnosisSection(report.diagnosis))
    lines.push(...screenshotSection(report))
    if (report.lastTestOutput) {
      lines.push('## Last test output', '', '```', report.lastTestOutput.slice(-4000), '```', '')
    }
    lines.push('## Timeline', '')
    for (const ev of timeline) {
      const detail = ev.detail ? ` — ${ev.detail}` : ''
      lines.push(`- \`${ev.kind}\`${detail}`)
    }
    lines.push('')
    writeFileSync(join(dir, 'report.md'), lines.filter((l) => l !== undefined).join('\n'), 'utf-8')
  } catch (err) {
    logger.warn(
      { reportId: report.id, err: (err as Error).message },
      'troubleshoot evidence: failed to write report.md',
    )
  }
}

/**
 * Single entry point used by the pipeline: append the event to the timeline,
 * then re-render report.md from the report's current DTO state. Best-effort —
 * any failure is logged and swallowed so evidence never blocks the fix flow.
 */
export async function recordEvidence(
  deps: CoreDeps,
  workspaceAbs: string,
  reportId: string,
  event: Omit<TimelineEvent, 'at'> & { at: number },
): Promise<void> {
  appendTimelineEvent(workspaceAbs, reportId, event)
  const fetched = await useCases.troubleshoot.getTroubleshootReport(deps, reportId)
  if (!fetched.ok) return
  const timeline = readTimeline(workspaceAbs, reportId)
  writeReportMarkdown(workspaceAbs, fetched.value, timeline)
}

/**
 * Resolve the workspace for a report by walking
 * report → task → story → quote → phase → project, then record evidence.
 * Use this from call sites that only have a reportId (e.g. the worker
 * post-run hook). No-ops silently when the chain can't be resolved.
 */
export async function recordEvidenceForReport(
  deps: CoreDeps,
  reportId: string,
  event: Omit<TimelineEvent, 'at'> & { at: number },
): Promise<void> {
  const report = await deps.storage.getTroubleshootReportById(reportId)
  if (!report) return
  const task = await deps.storage.getTaskById(report.taskId)
  if (!task) return
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) return
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) return
  const workspace = project.workspacePath ?? workspacePathFor(project.code)
  await recordEvidence(deps, workspace, reportId, event)
}

/**
 * Enqueue an operator-facing inbox notification for a terminal troubleshoot
 * outcome (escalated / verified). Best-effort: a failed enqueue is logged
 * and swallowed so it never breaks the fix pipeline.
 */
export async function notifyTroubleshootOutcome(
  deps: CoreDeps,
  reportId: string,
  outcome: 'escalated' | 'verified',
): Promise<void> {
  try {
    const report = await deps.storage.getTroubleshootReportById(reportId)
    if (!report) return
    const task = await deps.storage.getTaskById(report.taskId)
    const projectId = task ? await projectIdForTask(deps, task.storyId) : null
    const isEscalated = outcome === 'escalated'
    await useCases.inbox.enqueueInboxItem(deps, {
      kind: isEscalated ? 'troubleshoot_escalated' : 'troubleshoot_verified',
      title: isEscalated
        ? 'Troubleshoot escalado — requiere tu intervención'
        : 'Troubleshoot verificado — fix aplicado',
      body: report.errorText.slice(0, 400),
      ...(projectId ? { projectId } : {}),
      taskId: report.taskId,
    })
  } catch (err) {
    logger.warn(
      { reportId, err: (err as Error).message },
      'troubleshoot: inbox notify failed (non-fatal)',
    )
  }
}

async function projectIdForTask(deps: CoreDeps, storyId: string): Promise<string | null> {
  const story = await deps.storage.getStoryById(storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  return project?.id ?? null
}

/** Read back the timeline so report.md can embed it. Returns [] on any error. */
export function readTimeline(workspaceAbs: string, reportId: string): TimelineEvent[] {
  try {
    const path = join(workspaceAbs, '05-build', '_troubleshoots', reportId, 'timeline.jsonl')
    if (!existsSync(path)) return []
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as TimelineEvent)
  } catch {
    return []
  }
}
