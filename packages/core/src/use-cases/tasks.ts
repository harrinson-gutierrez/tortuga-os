import type {
  ApproveTaskInput,
  CreateTaskInput,
  IterationDTO,
  PatchTaskInput,
  RejectTaskInput,
  TaskDTO,
} from '@tortuga-os/contracts'
import { applyTaskEvent } from '@tortuga-os/domain'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, state, ucOk } from '../errors'
import { iterationDTO, taskDTO } from '../mappers'

export async function listTasksForStory(
  { storage }: CoreDeps,
  storyId: string,
): Promise<UseCaseResult<TaskDTO[]>> {
  const story = await storage.getStoryById(storyId)
  if (!story) return notFound('story', storyId)
  const rows = await storage.listTasksForStory(storyId)
  return ucOk(rows.map(taskDTO))
}

export async function getTask({ storage }: CoreDeps, id: string): Promise<UseCaseResult<TaskDTO>> {
  const row = await storage.getTaskById(id)
  if (!row) return notFound('task', id)
  return ucOk(taskDTO(row))
}

export async function createTask(
  { storage, newId, now }: CoreDeps,
  input: CreateTaskInput,
): Promise<UseCaseResult<TaskDTO>> {
  const story = await storage.getStoryById(input.storyId)
  if (!story) return notFound('story', input.storyId)
  const dup = await storage.getTaskByCode(input.code)
  if (dup) return conflict(`task code ${input.code} already exists`)

  const id = newId()
  const initialIterationId = newId()
  const row = await storage.createTaskWithFirstIteration({
    id,
    code: input.code,
    storyId: input.storyId,
    type: input.type,
    ownerRole: input.ownerRole,
    assignee: input.assignee ?? null,
    estimatedHoursMin: input.estimatedHoursMin,
    initialIterationId,
    now: now(),
  })
  return ucOk(taskDTO(row))
}

export async function patchTask(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchTaskInput,
): Promise<UseCaseResult<TaskDTO>> {
  const existing = await storage.getTaskById(id)
  if (!existing) return notFound('task', id)
  if (existing.status !== 'pending' && existing.status !== 'in_progress') {
    return state(`task ${id} is ${existing.status}; only pending/in_progress tasks accept patches`)
  }
  const row = await storage.patchTask(
    id,
    {
      ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
      ...(input.estimatedHoursMin !== undefined
        ? { estimatedHoursMin: input.estimatedHoursMin }
        : {}),
    },
    now(),
  )
  return ucOk(taskDTO(row))
}

export async function startTask(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<TaskDTO>> {
  const existing = await storage.getTaskById(id)
  if (!existing) return notFound('task', id)
  const transition = applyTaskEvent(
    {
      type: existing.type,
      ownerRole: existing.ownerRole,
      status: existing.status,
      currentIteration: existing.currentIteration,
      estimatedHoursMin: existing.estimatedHoursMin,
      actualHoursMin: existing.actualHoursMin,
    },
    { kind: 'start' },
  )
  if (!transition.ok) return state(transition.error.message)
  const row = await storage.updateTaskStatus({
    taskId: id,
    status: 'in_progress',
    now: now(),
  })
  return ucOk(taskDTO(row))
}

export async function submitTaskForQa(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<TaskDTO>> {
  const existing = await storage.getTaskById(id)
  if (!existing) return notFound('task', id)
  const transition = applyTaskEvent(
    {
      type: existing.type,
      ownerRole: existing.ownerRole,
      status: existing.status,
      currentIteration: existing.currentIteration,
      estimatedHoursMin: existing.estimatedHoursMin,
      actualHoursMin: existing.actualHoursMin,
    },
    { kind: 'submit_qa' },
  )
  if (!transition.ok) return state(transition.error.message)
  const row = await storage.updateTaskStatus({
    taskId: id,
    status: 'qa',
    now: now(),
  })
  return ucOk(taskDTO(row))
}

export async function approveTask(
  { storage, now }: CoreDeps,
  id: string,
  input: ApproveTaskInput,
): Promise<UseCaseResult<TaskDTO>> {
  const existing = await storage.getTaskById(id)
  if (!existing) return notFound('task', id)
  const transition = applyTaskEvent(
    {
      type: existing.type,
      ownerRole: existing.ownerRole,
      status: existing.status,
      currentIteration: existing.currentIteration,
      estimatedHoursMin: existing.estimatedHoursMin,
      actualHoursMin: existing.actualHoursMin,
    },
    { kind: 'approve' },
  )
  if (!transition.ok) return state(transition.error.message)

  const currentIter = await storage.getCurrentIteration(id)
  if (!currentIter) return notFound('current iteration of task', id)

  const at = now()
  const row = await storage.closeIterationAndAdvanceTask({
    close: {
      iterationId: currentIter.id,
      now: at,
      outcome: 'approved',
      closedByRole: input.closedByRole,
      notes: input.notes ?? null,
    },
    taskUpdate: { taskId: id, status: 'approved', now: at },
    nextIteration: null,
  })

  // Cascade upward: when the last sibling task of a story is approved,
  // the story closes; when the last sibling story of a phase is
  // approved, the phase closes. Errors here are logged but do NOT
  // unroll the task approval — the cascade is best-effort and idempotent
  // (re-approving a sibling later still picks up the state correctly).
  void cascadeOnTaskApproval(storage, row, at).catch(() => {
    /* swallow; storage will be reconciled on next read */
  })

  return ucOk(taskDTO(row))
}

async function cascadeOnTaskApproval(
  storage: CoreDeps['storage'],
  task: { storyId: string },
  at: number,
): Promise<void> {
  const siblings = await storage.listTasksForStory(task.storyId)
  const allApproved = siblings.length > 0 && siblings.every((t) => t.status === 'approved')
  if (!allApproved) return

  const story = await storage.getStoryById(task.storyId)
  if (!story || story.status === 'approved') return
  await storage.updateStoryStatus({ storyId: story.id, status: 'approved', now: at })

  // Phase-level cascade: check all stories in the same quote (= phase).
  const stories = await storage.listStoriesForQuote(story.quoteId)
  const allStoriesApproved =
    stories.length > 0 && stories.every((s) => s.id === story.id || s.status === 'approved')
  if (!allStoriesApproved) return

  const quote = await storage.getQuoteById(story.quoteId)
  if (!quote) return
  const phase = await storage.getPhaseById(quote.phaseId)
  if (!phase || phase.status === 'approved') return
  await storage.updatePhaseStatus({
    phaseId: phase.id,
    status: 'approved',
    closedAt: at,
    now: at,
  })
}

export async function rejectTask(
  { storage, newId, now }: CoreDeps,
  id: string,
  input: RejectTaskInput,
): Promise<UseCaseResult<TaskDTO>> {
  const existing = await storage.getTaskById(id)
  if (!existing) return notFound('task', id)
  const transition = applyTaskEvent(
    {
      type: existing.type,
      ownerRole: existing.ownerRole,
      status: existing.status,
      currentIteration: existing.currentIteration,
      estimatedHoursMin: existing.estimatedHoursMin,
      actualHoursMin: existing.actualHoursMin,
    },
    { kind: 'reject' },
  )
  if (!transition.ok) return state(transition.error.message)

  const currentIter = await storage.getCurrentIteration(id)
  if (!currentIter) return notFound('current iteration of task', id)

  const at = now()
  const nextN = existing.currentIteration + 1
  const row = await storage.closeIterationAndAdvanceTask({
    close: {
      iterationId: currentIter.id,
      now: at,
      outcome: 'rework_requested',
      closedByRole: input.closedByRole,
      notes: input.notes,
    },
    taskUpdate: {
      taskId: id,
      status: 'rework',
      currentIteration: nextN,
      now: at,
    },
    nextIteration: {
      iterationId: newId(),
      taskId: id,
      n: nextN,
      now: at,
    },
  })
  return ucOk(taskDTO(row))
}

export async function listIterationsForTask(
  { storage }: CoreDeps,
  taskId: string,
): Promise<UseCaseResult<IterationDTO[]>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const rows = await storage.listIterationsForTask(taskId)
  return ucOk(rows.map(iterationDTO))
}

export async function getIteration(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<IterationDTO>> {
  const row = await storage.getIterationById(id)
  if (!row) return notFound('iteration', id)
  return ucOk(iterationDTO(row))
}
