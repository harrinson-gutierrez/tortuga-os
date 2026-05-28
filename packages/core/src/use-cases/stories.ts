import type { CreateStoryInput, PatchStoryInput, StoryDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, ucOk } from '../errors'
import { storyDTO } from '../mappers'

export async function listStoriesForQuote(
  { storage }: CoreDeps,
  quoteId: string,
): Promise<UseCaseResult<StoryDTO[]>> {
  const quote = await storage.getQuoteById(quoteId)
  if (!quote) return notFound('quote', quoteId)
  const rows = await storage.listStoriesForQuote(quoteId)
  return ucOk(rows.map(storyDTO))
}

export async function listStoriesForProject(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<StoryDTO[]>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const phase = await storage.getSalesPhase(proj.project.id)
  if (!phase) return ucOk([])
  const quote = await storage.getLatestQuoteForSalesPhase(phase.id)
  if (!quote) return ucOk([])
  const rows = await storage.listStoriesForQuote(quote.id)
  return ucOk(rows.map(storyDTO))
}

export async function getStory(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<StoryDTO>> {
  const row = await storage.getStoryById(id)
  if (!row) return notFound('story', id)
  return ucOk(storyDTO(row))
}

export async function createStory(
  { storage, newId, now }: CoreDeps,
  input: CreateStoryInput,
): Promise<UseCaseResult<StoryDTO>> {
  const quote = await storage.getQuoteById(input.quoteId)
  if (!quote) return notFound('quote', input.quoteId)

  const dup = await storage.getStoryByCode(input.code)
  if (dup) return conflict(`story code ${input.code} already exists`)

  const row = await storage.createStory({
    id: newId(),
    quoteId: input.quoteId,
    code: input.code,
    title: input.title,
    goal: input.goal,
    acceptanceCriteriaJson: input.acceptanceCriteriaJson,
    inputsJson: input.inputsJson,
    outputsJson: input.outputsJson,
    verificationJson: input.verificationJson,
    outOfScopeJson: input.outOfScopeJson,
    estimatedHoursMin: input.estimatedHoursMin,
    actualHoursMin: 0,
    status: 'pending',
    priority: input.priority,
    ownerRole: input.ownerRole,
    now: now(),
  })
  return ucOk(storyDTO(row))
}

export async function patchStory(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchStoryInput,
): Promise<UseCaseResult<StoryDTO>> {
  const existing = await storage.getStoryById(id)
  if (!existing) return notFound('story', id)
  const row = await storage.patchStory(
    id,
    {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.goal !== undefined ? { goal: input.goal } : {}),
      ...(input.acceptanceCriteriaJson !== undefined
        ? { acceptanceCriteriaJson: input.acceptanceCriteriaJson }
        : {}),
      ...(input.inputsJson !== undefined ? { inputsJson: input.inputsJson } : {}),
      ...(input.outputsJson !== undefined ? { outputsJson: input.outputsJson } : {}),
      ...(input.verificationJson !== undefined ? { verificationJson: input.verificationJson } : {}),
      ...(input.outOfScopeJson !== undefined ? { outOfScopeJson: input.outOfScopeJson } : {}),
      ...(input.estimatedHoursMin !== undefined
        ? { estimatedHoursMin: input.estimatedHoursMin }
        : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.ownerRole !== undefined ? { ownerRole: input.ownerRole } : {}),
    },
    now(),
  )
  return ucOk(storyDTO(row))
}
