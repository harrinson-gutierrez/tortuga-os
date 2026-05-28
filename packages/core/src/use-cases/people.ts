import type { CreatePersonInput, PatchPersonInput, PersonDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { personDTO } from '../mappers'

export async function listPeople({ storage }: CoreDeps): Promise<UseCaseResult<PersonDTO[]>> {
  const rows = await storage.listPeople()
  return ucOk(rows.map(personDTO))
}

export async function getPerson(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<PersonDTO>> {
  const row = await storage.getPersonById(id)
  if (!row) return notFound('person', id)
  return ucOk(personDTO(row))
}

export async function createPerson(
  { storage, newId }: CoreDeps,
  input: CreatePersonInput,
): Promise<UseCaseResult<PersonDTO>> {
  const id = newId()
  const row = await storage.createPerson({
    id,
    name: input.name,
    email: input.email ?? null,
  })
  return ucOk(personDTO(row))
}

export async function patchPerson(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchPersonInput,
): Promise<UseCaseResult<PersonDTO>> {
  const existing = await storage.getPersonById(id)
  if (!existing) return notFound('person', id)
  const row = await storage.patchPerson(
    id,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
    },
    now(),
  )
  return ucOk(personDTO(row))
}

export async function deletePerson(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getPersonById(id)
  if (!existing) return notFound('person', id)
  await storage.softDeletePerson(id, now())
  return ucOk({ ok: true })
}
