/**
 * Reusable project snapshots. The operator saves the scope of a typical
 * sale once and instantiates it as the starting point for the next
 * client of that service.
 *
 * "Instantiate into a project" is NOT here yet — it's a complex flow
 * that would create a project + seed stories + tasks + modules +
 * milestones atomically. For now we only manage the kit catalog.
 */

import type {
  CreateKitTemplateInput,
  KitTemplateDTO,
  PatchKitTemplateInput,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { kitTemplateDTO } from '../mappers'

export async function listKitTemplates({
  storage,
}: CoreDeps): Promise<UseCaseResult<KitTemplateDTO[]>> {
  const rows = await storage.listKitTemplates()
  return ucOk(rows.map(kitTemplateDTO))
}

export async function getKitTemplate(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<KitTemplateDTO>> {
  const row = await storage.getKitTemplateById(id)
  if (!row) return notFound('kit_template', id)
  return ucOk(kitTemplateDTO(row))
}

export async function createKitTemplate(
  { storage, newId, now }: CoreDeps,
  input: CreateKitTemplateInput,
): Promise<UseCaseResult<KitTemplateDTO>> {
  const row = await storage.createKitTemplate({
    id: newId(),
    name: input.name,
    description: input.description ?? null,
    stack: input.stack,
    snapshotJson: JSON.stringify(input.snapshot ?? {}),
    now: now(),
  })
  return ucOk(kitTemplateDTO(row))
}

export async function patchKitTemplate(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchKitTemplateInput,
): Promise<UseCaseResult<KitTemplateDTO>> {
  const existing = await storage.getKitTemplateById(id)
  if (!existing) return notFound('kit_template', id)
  const row = await storage.patchKitTemplate({
    id,
    patch: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.stack !== undefined ? { stack: input.stack } : {}),
      ...(input.snapshot !== undefined ? { snapshotJson: JSON.stringify(input.snapshot) } : {}),
    },
    now: now(),
  })
  return ucOk(kitTemplateDTO(row))
}

export async function deleteKitTemplate(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getKitTemplateById(id)
  if (!existing) return notFound('kit_template', id)
  await storage.softDeleteKitTemplate(id, now())
  return ucOk({ ok: true })
}
