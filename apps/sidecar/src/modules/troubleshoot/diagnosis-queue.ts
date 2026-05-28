import { systemPromptFor } from '@tortuga-os/agent-runner'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'

/**
 * Build the troubleshooter user prompt from the report. Includes the
 * error text, operator context, and (when this is a retry) the previous
 * diagnosis + the failing test output so the agent can refine.
 */
function buildUserPrompt(args: {
  reportId: string
  errorText: string
  contextNote: string | null
  parentReportId: string | null
  previousDiagnosis: string | null
  previousTestOutput: string | null
  attemptIndex: number
}): string {
  const lines: string[] = []
  lines.push('# Runtime error report')
  lines.push('')
  lines.push(`Report id: ${args.reportId}`)
  lines.push(`Attempt: ${args.attemptIndex}`)
  lines.push('')
  lines.push('## Error text')
  lines.push('```')
  lines.push(args.errorText)
  lines.push('```')
  if (args.contextNote?.trim()) {
    lines.push('')
    lines.push('## Operator context')
    lines.push(args.contextNote.trim())
  }
  if (args.parentReportId) {
    lines.push('')
    lines.push(`Supersedes previous report: ${args.parentReportId}`)
  }
  if (args.previousDiagnosis) {
    lines.push('')
    lines.push('## Previous diagnosis (refine, do not repeat)')
    lines.push('```json')
    lines.push(args.previousDiagnosis)
    lines.push('```')
  }
  if (args.previousTestOutput) {
    lines.push('')
    lines.push('## Previous test failure output (your last attempt did NOT fix the bug)')
    lines.push('```')
    lines.push(args.previousTestOutput.slice(-4000))
    lines.push('```')
  }
  return lines.join('\n')
}

/**
 * Queue the troubleshooter agent run for the report and link the runId
 * back so the worker post-run hook can find this report.
 */
export async function queueDiagnosisRun(deps: CoreDeps, reportId: string): Promise<string | null> {
  const reportRow = await deps.storage.getTroubleshootReportById(reportId)
  if (!reportRow) return null
  const queued = await useCases.agentRuns.queueAgentRun(deps, {
    taskId: reportRow.taskId,
    agentKind: 'troubleshooter',
    provider: 'claude-cli',
    systemPrompt: systemPromptFor('troubleshooter'),
    userPrompt: buildUserPrompt({
      reportId: reportRow.id,
      errorText: reportRow.errorText,
      contextNote: reportRow.contextNote,
      parentReportId: reportRow.parentReportId,
      previousDiagnosis: reportRow.diagnosisJson,
      previousTestOutput: reportRow.lastTestOutput,
      attemptIndex: reportRow.attemptCount + 1,
    }),
  })
  if (!queued.ok) {
    logger.warn({ reportId, error: queued.error }, 'troubleshoot: failed to queue diagnosis run')
    return null
  }
  await deps.storage.patchTroubleshootReport({
    id: reportId,
    now: Date.now(),
    lastDiagnosisRunId: queued.value.id,
  })
  return queued.value.id
}
