/**
 * Soft-delete trash: list rows whose deletedAt is non-null and restore
 * them. Today we expose clients, people and projects — all three have
 * `deletedAt` columns and use cases that soft-delete instead of hard.
 *
 * Stories, tasks, quotes etc. are NOT here because they cascade with
 * their parent project; restoring a project is enough to bring back
 * its whole subtree.
 */

import type { ClientDTO, PersonDTO, ProjectWithClientDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { clientDTO, personDTO, projectWithClientDTO } from '../mappers'

export async function listTrashedClients({
  storage,
}: CoreDeps): Promise<UseCaseResult<ClientDTO[]>> {
  const rows = await storage.listTrashedClients()
  return ucOk(rows.map(clientDTO))
}

export async function restoreClient(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<ClientDTO>> {
  const row = await storage.restoreClient(id, now())
  if (!row) return notFound('client', id)
  return ucOk(clientDTO(row))
}

export async function listTrashedPeople({
  storage,
}: CoreDeps): Promise<UseCaseResult<PersonDTO[]>> {
  const rows = await storage.listTrashedPeople()
  return ucOk(rows.map(personDTO))
}

export async function restorePerson(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<PersonDTO>> {
  const row = await storage.restorePerson(id, now())
  if (!row) return notFound('person', id)
  return ucOk(personDTO(row))
}

export async function listTrashedProjects({
  storage,
}: CoreDeps): Promise<UseCaseResult<ProjectWithClientDTO[]>> {
  const rows = await storage.listTrashedProjects()
  return ucOk(rows.map((r) => projectWithClientDTO(r.project, r.client)))
}

export async function restoreProject(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const row = await storage.restoreProject(id, now())
  if (!row) return notFound('project', id)
  return ucOk({ ok: true })
}
