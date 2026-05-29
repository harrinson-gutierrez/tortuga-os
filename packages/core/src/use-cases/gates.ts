import type {
  CreateGateInput,
  GateDTO,
  GateType,
  RecordGateOutcomeInput,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, state, ucOk, validation } from '../errors'
import { gateDTO } from '../mappers'

export async function listGatesForIteration(
  { storage }: CoreDeps,
  iterationId: string,
): Promise<UseCaseResult<GateDTO[]>> {
  const iter = await storage.getIterationById(iterationId)
  if (!iter) return notFound('iteration', iterationId)
  const rows = await storage.listGatesForIteration(iterationId)
  return ucOk(rows.map(gateDTO))
}

export async function getGate({ storage }: CoreDeps, id: string): Promise<UseCaseResult<GateDTO>> {
  const row = await storage.getGateById(id)
  if (!row) return notFound('gate', id)
  return ucOk(gateDTO(row))
}

export async function createGate(
  { storage, newId, now }: CoreDeps,
  input: CreateGateInput,
): Promise<UseCaseResult<GateDTO>> {
  const task = await storage.getTaskById(input.taskId)
  if (!task) return notFound('task', input.taskId)
  const iter = await storage.getIterationById(input.iterationId)
  if (!iter) return notFound('iteration', input.iterationId)
  if (iter.taskId !== task.id) {
    return validation('iterationId', 'iteration does not belong to task')
  }
  const existing = await storage.countGateForIteration(input.iterationId, input.gateType)
  if (existing > 0) {
    return conflict(`gate ${input.gateType} already exists for iteration`)
  }
  const row = await storage.createGate({
    id: newId(),
    taskId: input.taskId,
    iterationId: input.iterationId,
    gateType: input.gateType,
    now: now(),
  })
  return ucOk(gateDTO(row))
}

export async function recordGateOutcome(
  { storage, now }: CoreDeps,
  id: string,
  input: RecordGateOutcomeInput,
): Promise<UseCaseResult<GateDTO>> {
  const existing = await storage.getGateById(id)
  if (!existing) return notFound('gate', id)
  // Without `force`, gates are write-once: once a runner recorded an
  // outcome (passed/failed/skipped), only `pending` gates can transition.
  // With `force`, the operator can override — useful when the runner
  // misclassified a false negative (e.g. APK was built but exit code
  // was non-zero due to Gradle cache cleanup errors).
  if (existing.status !== 'pending' && !input.force) {
    return state(`gate ${id} already has status ${existing.status}`)
  }
  const row = await storage.recordGateOutcome({
    gateId: id,
    status: input.status,
    outputPath: input.outputPath ?? null,
    now: now(),
  })
  return ucOk(gateDTO(row))
}

export async function resetGatesForTask(
  { storage }: CoreDeps,
  taskId: string,
  types: GateType[],
): Promise<UseCaseResult<{ deleted: number }>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const iter = await storage.getCurrentIteration(taskId)
  if (!iter) return notFound('current iteration of task', taskId)
  const deleted = await storage.deleteGatesForIteration({ iterationId: iter.id, types })
  return ucOk({ deleted })
}
