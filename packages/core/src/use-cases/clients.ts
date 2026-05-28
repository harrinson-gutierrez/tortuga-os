import type { ClientDTO, CreateClientInput, PatchClientInput } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, ucOk } from '../errors'
import { clientDTO } from '../mappers'

export async function listClients({ storage }: CoreDeps): Promise<UseCaseResult<ClientDTO[]>> {
  const rows = await storage.listClients()
  return ucOk(rows.map(clientDTO))
}

export async function getClient(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<ClientDTO>> {
  const row = await storage.getClientById(id)
  if (!row) return notFound('client', id)
  return ucOk(clientDTO(row))
}

export async function createClient(
  { storage, newId, now }: CoreDeps,
  input: CreateClientInput,
): Promise<UseCaseResult<ClientDTO>> {
  const id = newId()
  const at = now()
  const row = await storage.createClient({
    id,
    name: input.name,
    taxId: input.taxId ?? null,
    contactEmail: input.contactEmail ?? null,
    driveFolderId: input.driveFolderId ?? null,
  })
  // Storage seeds createdAt/updatedAt; we don't override them here because
  // the storage adapter is the canonical clock for its own rows.
  void at
  return ucOk(clientDTO(row))
}

export async function patchClient(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchClientInput,
): Promise<UseCaseResult<ClientDTO>> {
  const existing = await storage.getClientById(id)
  if (!existing) return notFound('client', id)
  const row = await storage.patchClient(
    id,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.driveFolderId !== undefined ? { driveFolderId: input.driveFolderId } : {}),
    },
    now(),
  )
  return ucOk(clientDTO(row))
}

export async function deleteClient(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getClientById(id)
  if (!existing) return notFound('client', id)
  const aliveProjects = await storage.countActiveProjectsForClient(id)
  if (aliveProjects > 0) {
    return conflict(`client ${id} has ${aliveProjects} active project(s); archive them first`)
  }
  await storage.softDeleteClient(id, now())
  return ucOk({ ok: true })
}
