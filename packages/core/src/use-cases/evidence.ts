import type { CreateEvidenceInput, EvidenceDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk, validation } from '../errors'
import { evidenceDTO } from '../mappers'

export async function listEvidenceForIteration(
  { storage }: CoreDeps,
  iterationId: string,
): Promise<UseCaseResult<EvidenceDTO[]>> {
  const iter = await storage.getIterationById(iterationId)
  if (!iter) return notFound('iteration', iterationId)
  const rows = await storage.listEvidenceForIteration(iterationId)
  return ucOk(rows.map(evidenceDTO))
}

export async function getEvidence(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<EvidenceDTO>> {
  const row = await storage.getEvidenceById(id)
  if (!row) return notFound('evidence', id)
  return ucOk(evidenceDTO(row))
}

export async function createEvidence(
  { storage, newId, now }: CoreDeps,
  input: CreateEvidenceInput,
): Promise<UseCaseResult<EvidenceDTO>> {
  const task = await storage.getTaskById(input.taskId)
  if (!task) return notFound('task', input.taskId)
  const iter = await storage.getIterationById(input.iterationId)
  if (!iter) return notFound('iteration', input.iterationId)
  if (iter.taskId !== task.id) {
    return validation('iterationId', 'iteration does not belong to task')
  }
  const row = await storage.createEvidence({
    id: newId(),
    taskId: input.taskId,
    iterationId: input.iterationId,
    type: input.type,
    kind: input.kind,
    path: input.path,
    createdByRole: input.createdByRole,
    createdByAssignee: input.createdByAssignee ?? null,
    notes: input.notes ?? null,
    now: now(),
  })
  return ucOk(evidenceDTO(row))
}
