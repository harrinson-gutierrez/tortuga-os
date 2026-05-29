/**
 * Reusable project snapshots. The operator saves the scope of a typical
 * sale once and instantiates it as the starting point for the next
 * client of that service.
 */

import type {
  CreateKitTemplateInput,
  InstantiateKitInput,
  InstantiateKitResult,
  KitSnapshot,
  KitTemplateDTO,
  PatchKitTemplateInput,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, state, ucOk } from '../errors'
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

/**
 * Instantiate a kit's snapshot into an existing project's draft quote.
 *
 * Modules are project-scoped (the quoting palette); milestones and stories
 * hang off the latest draft quote of the project's sales phase. The whole
 * seed runs against a single draft quote and aborts early if no draft
 * exists, so the operator never ends up with a half-seeded non-draft quote.
 *
 * Story codes are derived as `<PROJECT>-K<i>` and de-duplicated against
 * existing codes so re-running a kit (or stacking two kits) never collides.
 */
export async function instantiateKit(
  deps: CoreDeps,
  input: InstantiateKitInput,
): Promise<UseCaseResult<InstantiateKitResult>> {
  const { storage } = deps
  const kit = await storage.getKitTemplateById(input.kitTemplateId)
  if (!kit) return notFound('kit_template', input.kitTemplateId)

  const proj = await storage.getProjectByCode(input.projectCode)
  if (!proj) return notFound('project', input.projectCode)

  const phase = await storage.getSalesPhase(proj.project.id)
  if (!phase) return state(`project ${input.projectCode} has no sales phase`)
  const quote = await storage.getLatestQuoteForSalesPhase(phase.id)
  if (!quote) return state(`project ${input.projectCode} has no quote to seed into`)
  if (quote.status !== 'draft') {
    return state(`latest quote of ${input.projectCode} is not draft (status=${quote.status})`)
  }

  let snapshot: KitSnapshot
  try {
    snapshot = JSON.parse(kit.snapshotJson) as KitSnapshot
  } catch {
    return state(`kit ${input.kitTemplateId} has an unparseable snapshot`)
  }

  const created = await seedSnapshot(deps, {
    projectCode: input.projectCode,
    quoteId: quote.id,
    snapshot,
  })

  return ucOk({
    projectCode: input.projectCode,
    quoteId: quote.id,
    modulesCreated: created.modules,
    milestonesCreated: created.milestones,
    storiesCreated: created.stories,
  })
}

async function seedSnapshot(
  { storage, newId, now }: CoreDeps,
  args: { projectCode: string; quoteId: string; snapshot: KitSnapshot },
): Promise<{ modules: number; milestones: number; stories: number }> {
  const { projectCode, quoteId, snapshot } = args
  const proj = await storage.getProjectByCode(projectCode)
  const projectId = proj!.project.id

  let modules = 0
  const moduleList = snapshot.modules ?? []
  for (let i = 0; i < moduleList.length; i++) {
    const m = moduleList[i]!
    await storage.createQuoteModule({
      id: newId(),
      projectId,
      name: m.name,
      description: m.description ?? null,
      defaultHoursJson: JSON.stringify(m.defaultHoursByRole ?? {}),
      defaultMarginBps: m.defaultMarginBps ?? 0,
      sortOrder: (i + 1) * 10,
      now: now(),
    })
    modules++
  }

  let milestones = 0
  const existingMilestones = await storage.listQuoteMilestones(quoteId)
  let milestoneSort = existingMilestones.reduce((acc, s) => Math.max(acc, s.sortOrder), 0)
  for (const ms of snapshot.milestones ?? []) {
    milestoneSort += 10
    await storage.createQuoteMilestone({
      id: newId(),
      quoteId,
      label: ms.label,
      description: ms.description ?? null,
      percentageBps: ms.percentageBps,
      gateType: null,
      sortOrder: milestoneSort,
      now: now(),
    })
    milestones++
  }

  let stories = 0
  const storyList = snapshot.stories ?? []
  if (storyList.length > 0) {
    const taken = new Set<string>()
    for (const s of await storage.listStoriesForQuote(quoteId)) {
      taken.add(s.code)
    }
    for (let i = 0; i < storyList.length; i++) {
      const s = storyList[i]!
      const code = nextStoryCode(projectCode, s.code, i, taken)
      taken.add(code)
      await storage.createStory({
        id: newId(),
        quoteId,
        code,
        title: s.title,
        goal: s.goal,
        acceptanceCriteriaJson: JSON.stringify(s.acceptanceCriteria ?? []),
        inputsJson: '{}',
        outputsJson: '{}',
        verificationJson: '{}',
        outOfScopeJson: '[]',
        estimatedHoursMin: s.estimatedHoursMin ?? 0,
        actualHoursMin: 0,
        status: 'pending',
        priority: 3,
        ownerRole: 'dev',
        now: now(),
      })
      stories++
    }
  }

  await storage.recomputeQuoteTotals(quoteId, now())
  return { modules, milestones, stories }
}

function nextStoryCode(
  projectCode: string,
  preferred: string | undefined,
  index: number,
  taken: Set<string>,
): string {
  const base =
    preferred && preferred.trim().length > 0 ? preferred.trim() : `${projectCode}-K${index + 1}`
  if (!taken.has(base)) return base
  let suffix = 2
  while (taken.has(`${base}-${suffix}`)) suffix++
  return `${base}-${suffix}`
}
