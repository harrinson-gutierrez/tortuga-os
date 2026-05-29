import type { Role } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import type { StepAckKind, StepAckRow } from '../storage'

export interface StepAckDTO {
  id: string
  taskId: string
  iterationN: number
  stepId: string
  ack: StepAckKind
  ackedByRole: Role
  notes: string | null
  ackedAt: number
}

const toDTO = (row: StepAckRow): StepAckDTO => ({
  id: row.id,
  taskId: row.taskId,
  iterationN: row.iterationN,
  stepId: row.stepId,
  ack: row.ack,
  ackedByRole: row.ackedByRole,
  notes: row.notes,
  ackedAt: row.ackedAt,
})

export async function listStepAcks(
  { storage }: CoreDeps,
  taskId: string,
): Promise<UseCaseResult<StepAckDTO[]>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const rows = await storage.listStepAcksForTaskIteration(taskId, task.currentIteration)
  return ucOk(rows.map(toDTO))
}

export interface UpsertStepAckInput {
  stepId: string
  ack: StepAckKind
  ackedByRole: Role
  notes?: string
}

export async function upsertStepAck(
  { storage, newId, now }: CoreDeps,
  taskId: string,
  input: UpsertStepAckInput,
): Promise<UseCaseResult<StepAckDTO>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const row = await storage.upsertStepAck({
    id: newId(),
    taskId,
    iterationN: task.currentIteration,
    stepId: input.stepId,
    ack: input.ack,
    ackedByRole: input.ackedByRole,
    notes: input.notes ?? null,
    now: now(),
  })
  return ucOk(toDTO(row))
}

export async function deleteStepAck(
  { storage }: CoreDeps,
  taskId: string,
  stepId: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  await storage.deleteStepAck({
    taskId,
    iterationN: task.currentIteration,
    stepId,
  })
  return ucOk({ ok: true })
}
