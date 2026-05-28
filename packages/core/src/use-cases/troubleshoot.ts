import type {
  ConfirmTroubleshootInput,
  CreateTroubleshootInput,
  MarkActionDoneInput,
  RequiredOperatorAction,
  TroubleshootDiagnosis,
  TroubleshootReportDTO,
} from '@tortuga-os/contracts'
import type { TroubleshootStatus } from '@tortuga-os/domain'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, state, ucOk } from '../errors'
import { troubleshootReportDTO } from '../mappers'

export async function listTroubleshootReportsForTask(
  { storage }: CoreDeps,
  taskId: string,
): Promise<UseCaseResult<TroubleshootReportDTO[]>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const rows = await storage.listTroubleshootReportsForTask(taskId)
  return ucOk(rows.map(troubleshootReportDTO))
}

export async function getTroubleshootReport(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(id)
  if (!row) return notFound('troubleshoot_report', id)
  return ucOk(troubleshootReportDTO(row))
}

export interface CreateTroubleshootReportArgs extends CreateTroubleshootInput {
  /** Absolute path where the sidecar decoded the screenshot, workspace-relative. */
  beforeScreenshotPath?: string | null
}

export async function createTroubleshootReport(
  { storage, newId, now }: CoreDeps,
  input: CreateTroubleshootReportArgs,
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const task = await storage.getTaskById(input.taskId)
  if (!task) return notFound('task', input.taskId)
  if (input.parentReportId) {
    const parent = await storage.getTroubleshootReportById(input.parentReportId)
    if (!parent) return notFound('troubleshoot_report', input.parentReportId)
  }
  const row = await storage.createTroubleshootReport({
    id: newId(),
    taskId: input.taskId,
    parentReportId: input.parentReportId ?? null,
    errorText: input.errorText,
    contextNote: input.contextNote ?? null,
    beforeScreenshotPath: input.beforeScreenshotPath ?? null,
    now: now(),
  })
  return ucOk(troubleshootReportDTO(row))
}

/**
 * Persist the diagnosis JSON the troubleshooter agent emitted plus the
 * id of the agent_run that produced it. Transitions status to `proposed`
 * (or `awaiting-operator` if the diagnosis lists requiredOperatorActions).
 */
export async function attachDiagnosis(
  { storage, now }: CoreDeps,
  args: {
    reportId: string
    diagnosis: TroubleshootDiagnosis
    runId: string
  },
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(args.reportId)
  if (!row) return notFound('troubleshoot_report', args.reportId)
  if (!['open', 'diagnosing', 'testing', 'awaiting-operator'].includes(row.status)) {
    return state(`report ${args.reportId} is in status ${row.status}; cannot attach diagnosis`)
  }
  const actions: RequiredOperatorAction[] = args.diagnosis.requiredOperatorActions.map((a) => ({
    ...a,
    completedAt: null,
  }))
  const nextStatus: TroubleshootStatus = actions.length > 0 ? 'awaiting-operator' : 'proposed'
  const patched = await storage.patchTroubleshootReport({
    id: args.reportId,
    now: now(),
    status: nextStatus,
    lastDiagnosisRunId: args.runId,
    diagnosisJson: JSON.stringify(args.diagnosis),
    requiredActionsJson: JSON.stringify(actions),
  })
  return ucOk(troubleshootReportDTO(patched))
}

/**
 * Transition a report into `diagnosing` so the UI can show the spinner
 * before the agent run is queued.
 */
export async function markDiagnosing(
  { storage, now }: CoreDeps,
  reportId: string,
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(reportId)
  if (!row) return notFound('troubleshoot_report', reportId)
  const patched = await storage.patchTroubleshootReport({
    id: reportId,
    now: now(),
    status: 'diagnosing',
    attemptCount: row.attemptCount + 1,
  })
  return ucOk(troubleshootReportDTO(patched))
}

/**
 * Mark one of the required operator actions as completed. Returns the
 * updated report. When every action is done the status flips back to
 * `proposed` so the apply step can resume.
 */
export async function markOperatorActionDone(
  { storage, now }: CoreDeps,
  reportId: string,
  input: MarkActionDoneInput,
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(reportId)
  if (!row) return notFound('troubleshoot_report', reportId)
  if (row.status !== 'awaiting-operator') {
    return state(`report ${reportId} is not awaiting operator (status=${row.status})`)
  }
  let actions: RequiredOperatorAction[]
  try {
    const parsed = JSON.parse(row.requiredActionsJson)
    if (!Array.isArray(parsed)) return state('required_actions_json is not an array')
    actions = parsed as RequiredOperatorAction[]
  } catch {
    return state('required_actions_json is not valid JSON')
  }
  if (input.actionIndex < 0 || input.actionIndex >= actions.length) {
    return state(`actionIndex ${input.actionIndex} out of range (0..${actions.length - 1})`)
  }
  actions[input.actionIndex] = {
    ...actions[input.actionIndex]!,
    completedAt: now(),
  }
  const allDone = actions.every((a) => a.completedAt !== null)
  const nextStatus: TroubleshootStatus = allDone ? 'proposed' : 'awaiting-operator'
  const patched = await storage.patchTroubleshootReport({
    id: reportId,
    now: now(),
    status: nextStatus,
    requiredActionsJson: JSON.stringify(actions),
  })
  return ucOk(troubleshootReportDTO(patched))
}

/**
 * Transition the report through the apply → test pipeline. The applier
 * (in the sidecar module) calls these to persist progress; the
 * orchestrator transition machine guards what is legal.
 */
export async function markApplying(
  { storage, now }: CoreDeps,
  reportId: string,
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(reportId)
  if (!row) return notFound('troubleshoot_report', reportId)
  if (row.status !== 'proposed') {
    return state(`report ${reportId} must be in 'proposed' to apply (status=${row.status})`)
  }
  const patched = await storage.patchTroubleshootReport({
    id: reportId,
    now: now(),
    status: 'applying',
  })
  return ucOk(troubleshootReportDTO(patched))
}

export async function recordTestResult(
  { storage, now }: CoreDeps,
  args: { reportId: string; passed: boolean; output: string },
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(args.reportId)
  if (!row) return notFound('troubleshoot_report', args.reportId)
  const nextStatus: TroubleshootStatus = args.passed
    ? 'verified'
    : row.attemptCount >= 3
      ? 'escalated'
      : 'open'
  const patched = await storage.patchTroubleshootReport({
    id: args.reportId,
    now: now(),
    status: nextStatus,
    lastTestOutput: args.output,
  })
  return ucOk(troubleshootReportDTO(patched))
}

export async function confirmTroubleshoot(
  { storage, now }: CoreDeps,
  reportId: string,
  args: ConfirmTroubleshootInput & { afterScreenshotPath?: string | null },
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(reportId)
  if (!row) return notFound('troubleshoot_report', reportId)
  if (row.status !== 'verified') {
    return state(`report ${reportId} must be in 'verified' to confirm (status=${row.status})`)
  }
  const ts = now()
  const patched = await storage.patchTroubleshootReport({
    id: reportId,
    now: ts,
    status: 'resolved',
    resolvedAt: ts,
    ...(args.afterScreenshotPath !== undefined
      ? { afterScreenshotPath: args.afterScreenshotPath }
      : {}),
  })
  return ucOk(troubleshootReportDTO(patched))
}

export async function dismissTroubleshoot(
  { storage, now }: CoreDeps,
  reportId: string,
): Promise<UseCaseResult<TroubleshootReportDTO>> {
  const row = await storage.getTroubleshootReportById(reportId)
  if (!row) return notFound('troubleshoot_report', reportId)
  if (['resolved', 'dismissed'].includes(row.status)) {
    return state(`report ${reportId} is already closed (status=${row.status})`)
  }
  const patched = await storage.patchTroubleshootReport({
    id: reportId,
    now: now(),
    status: 'dismissed',
  })
  return ucOk(troubleshootReportDTO(patched))
}

export interface CreateBugfixForStoryInput {
  storyId: string
  errorText: string
  contextNote?: string
  beforeScreenshotPath?: string | null
}

export interface CreateBugfixForStoryOutput {
  taskId: string
  reportId: string
}

/**
 * Create a `bugfix` task under a story (typically already-approved) and
 * link it to a new troubleshoot report. The task uses the next available
 * T<n> slot inside the story's code (e.g. `GASTUU-002-T2`). The report
 * starts in `open` status — the caller (sidecar) is responsible for
 * transitioning it to `diagnosing` and queueing the agent run.
 *
 * Returns the new taskId so the UI can navigate to the wizard view.
 */
export async function createBugfixForStory(
  { storage, newId, now }: CoreDeps,
  input: CreateBugfixForStoryInput,
): Promise<UseCaseResult<CreateBugfixForStoryOutput>> {
  const story = await storage.getStoryById(input.storyId)
  if (!story) return notFound('story', input.storyId)
  const siblings = await storage.listTasksForStory(input.storyId)
  const maxN = siblings.reduce((acc, t) => {
    const m = /-T(\d+)$/.exec(t.code)
    if (!m || !m[1]) return acc
    const n = Number.parseInt(m[1], 10)
    return n > acc ? n : acc
  }, 0)
  const nextN = maxN + 1
  const code = `${story.code}-T${nextN}`
  const ts = now()

  const taskId = newId()
  const initialIterationId = newId()
  await storage.createTaskWithFirstIteration({
    id: taskId,
    code,
    storyId: input.storyId,
    type: 'bugfix',
    ownerRole: 'dev',
    assignee: null,
    estimatedHoursMin: 0,
    initialIterationId,
    now: ts,
  })

  const reportRow = await storage.createTroubleshootReport({
    id: newId(),
    taskId,
    parentReportId: null,
    errorText: input.errorText,
    contextNote: input.contextNote ?? null,
    beforeScreenshotPath: input.beforeScreenshotPath ?? null,
    now: ts,
  })

  return ucOk({ taskId, reportId: reportRow.id })
}
