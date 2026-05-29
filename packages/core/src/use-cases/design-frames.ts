import type {
  CreateDesignFrameInput,
  DesignFrameDTO,
  PatchDesignFrameInput,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { designFrameDTO } from '../mappers'

export async function listDesignFramesForStory(
  { storage }: CoreDeps,
  storyId: string,
): Promise<UseCaseResult<DesignFrameDTO[]>> {
  const story = await storage.getStoryById(storyId)
  if (!story) return notFound('story', storyId)
  const rows = await storage.listDesignFramesForStory(storyId)
  return ucOk(rows.map(designFrameDTO))
}

export async function getDesignFrame(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<DesignFrameDTO>> {
  const row = await storage.getDesignFrameById(id)
  if (!row) return notFound('design_frame', id)
  return ucOk(designFrameDTO(row))
}

export async function createDesignFrame(
  { storage, newId, now }: CoreDeps,
  input: CreateDesignFrameInput,
): Promise<UseCaseResult<DesignFrameDTO>> {
  const story = await storage.getStoryById(input.storyId)
  if (!story) return notFound('story', input.storyId)
  const row = await storage.createDesignFrame({
    id: newId(),
    storyId: input.storyId,
    figmaFileKey: input.figmaFileKey,
    figmaNodeId: input.figmaNodeId,
    name: input.name,
    tokensJson: JSON.stringify(input.tokens ?? {}),
    baselineScreenshotPath: input.baselineScreenshotPath ?? null,
    status: input.status ?? 'imported',
    fidelityPct: null,
    now: now(),
  })
  return ucOk(designFrameDTO(row))
}

export async function patchDesignFrame(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchDesignFrameInput,
): Promise<UseCaseResult<DesignFrameDTO>> {
  const existing = await storage.getDesignFrameById(id)
  if (!existing) return notFound('design_frame', id)
  const row = await storage.patchDesignFrame({
    id,
    patch: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tokens !== undefined ? { tokensJson: JSON.stringify(input.tokens) } : {}),
      ...(input.baselineScreenshotPath !== undefined
        ? { baselineScreenshotPath: input.baselineScreenshotPath }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.fidelityPct !== undefined ? { fidelityPct: input.fidelityPct } : {}),
    },
    now: now(),
  })
  return ucOk(designFrameDTO(row))
}

export async function deleteDesignFrame(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getDesignFrameById(id)
  if (!existing) return notFound('design_frame', id)
  await storage.softDeleteDesignFrame(id, now())
  return ucOk({ ok: true })
}
