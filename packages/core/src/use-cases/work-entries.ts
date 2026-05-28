import type { LogWorkEntryInput, WorkEntryDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { workEntryDTO } from '../mappers'

export async function listWorkEntriesForTask(
  { storage }: CoreDeps,
  taskId: string,
): Promise<UseCaseResult<WorkEntryDTO[]>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const rows = await storage.listWorkEntriesForTask(taskId)
  return ucOk(rows.map(workEntryDTO))
}

export async function listWorkEntriesForIteration(
  { storage }: CoreDeps,
  iterationId: string,
): Promise<UseCaseResult<WorkEntryDTO[]>> {
  const iter = await storage.getIterationById(iterationId)
  if (!iter) return notFound('iteration', iterationId)
  const rows = await storage.listWorkEntriesForIteration(iterationId)
  return ucOk(rows.map(workEntryDTO))
}

export async function logWorkEntry(
  { storage, newId, now }: CoreDeps,
  input: LogWorkEntryInput,
): Promise<UseCaseResult<WorkEntryDTO>> {
  const iter = await storage.getIterationById(input.iterationId)
  if (!iter) return notFound('iteration', input.iterationId)
  const person = await storage.getPersonById(input.personId)
  if (!person) return notFound('person', input.personId)

  const at = now()
  const row = await storage.logWorkEntry({
    id: newId(),
    iterationId: input.iterationId,
    taskId: iter.taskId,
    personId: input.personId,
    role: input.role,
    minutes: input.minutes,
    reworkTicketId: input.reworkTicketId ?? null,
    notes: input.notes ?? null,
    loggedAt: input.loggedAt ?? at,
    now: at,
  })
  return ucOk(workEntryDTO(row))
}

export async function getTaskTotalMinutes(
  { storage }: CoreDeps,
  taskId: string,
): Promise<UseCaseResult<{ taskId: string; totalMinutes: number }>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const total = await storage.getTaskTotalMinutes(taskId)
  return ucOk({ taskId, totalMinutes: total })
}
