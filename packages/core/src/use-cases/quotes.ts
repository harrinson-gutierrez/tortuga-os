import type {
  CreateQuoteItemInput,
  CreateQuoteMilestoneInput,
  CreateQuoteModuleInput,
  PatchQuoteInput,
  PatchQuoteItemInput,
  PatchQuoteMilestoneInput,
  PatchQuoteModuleInput,
  QuoteDTO,
  QuoteItemDTO,
  QuoteMilestoneDTO,
  QuoteModuleDTO,
  RequestQuoteChangesInput,
} from '@tortuga-os/contracts'
import { applyQuoteEvent } from '@tortuga-os/domain'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, state, ucOk } from '../errors'
import { quoteDTO, quoteItemDTO, quoteMilestoneDTO, quoteModuleDTO } from '../mappers'

export async function listQuotesForProject(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<QuoteDTO[]>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const phase = await storage.getSalesPhase(proj.project.id)
  if (!phase) return notFound('phase F1_SALES of project', projectCode)
  const rows = await storage.listQuotesForSalesPhase(phase.id)
  return ucOk(rows.map(quoteDTO))
}

export async function getCurrentQuote(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<QuoteDTO>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const phase = await storage.getSalesPhase(proj.project.id)
  if (!phase) return notFound('phase F1_SALES of project', projectCode)
  const latest = await storage.getLatestQuoteForSalesPhase(phase.id)
  if (!latest) return notFound('quote for project', projectCode)
  return ucOk(quoteDTO(latest))
}

export async function getQuote(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<QuoteDTO>> {
  const row = await storage.getQuoteById(id)
  if (!row) return notFound('quote', id)
  return ucOk(quoteDTO(row))
}

export async function patchQuote(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchQuoteInput,
): Promise<UseCaseResult<QuoteDTO>> {
  const existing = await storage.getQuoteById(id)
  if (!existing) return notFound('quote', id)
  const transition = applyQuoteEvent(
    {
      version: existing.version,
      status: existing.status,
      totalHoursMin: existing.totalHoursMin,
      totalCostCents: existing.totalCostCents,
      discountBps: existing.discountBps,
      approvedAt: existing.approvedAt,
    },
    {
      kind: 'patch',
      ...(input.totalHoursMin !== undefined ? { totalHoursMin: input.totalHoursMin } : {}),
      ...(input.totalCostCents !== undefined ? { totalCostCents: input.totalCostCents } : {}),
      ...(input.discountBps !== undefined ? { discountBps: input.discountBps } : {}),
    },
  )
  if (!transition.ok) return state(transition.error.message)
  const row = await storage.patchQuote(
    id,
    {
      ...(input.totalHoursMin !== undefined ? { totalHoursMin: input.totalHoursMin } : {}),
      ...(input.totalCostCents !== undefined ? { totalCostCents: input.totalCostCents } : {}),
      ...(input.discountBps !== undefined ? { discountBps: input.discountBps } : {}),
    },
    now(),
  )
  return ucOk(quoteDTO(row))
}

export async function sendQuote(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<QuoteDTO>> {
  const existing = await storage.getQuoteById(id)
  if (!existing) return notFound('quote', id)
  const transition = applyQuoteEvent(
    {
      version: existing.version,
      status: existing.status,
      totalHoursMin: existing.totalHoursMin,
      totalCostCents: existing.totalCostCents,
      discountBps: existing.discountBps,
      approvedAt: existing.approvedAt,
    },
    { kind: 'send' },
  )
  if (!transition.ok) return state(transition.error.message)
  const row = await storage.updateQuoteStatus(id, 'sent', now())
  return ucOk(quoteDTO(row))
}

export async function approveQuote(
  { storage, newId, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<QuoteDTO>> {
  const existing = await storage.getQuoteById(id)
  if (!existing) return notFound('quote', id)
  const transition = applyQuoteEvent(
    {
      version: existing.version,
      status: existing.status,
      totalHoursMin: existing.totalHoursMin,
      totalCostCents: existing.totalCostCents,
      discountBps: existing.discountBps,
      approvedAt: existing.approvedAt,
    },
    { kind: 'approve', at: now() },
  )
  if (!transition.ok) return state(transition.error.message)

  const row = await storage.approveQuoteAndOpenKickoff({
    quoteId: id,
    kickoffPhaseId: newId(),
    now: now(),
  })
  return ucOk(quoteDTO(row))
}

export async function requestQuoteChanges(
  { storage, newId, now }: CoreDeps,
  id: string,
  _input: RequestQuoteChangesInput,
): Promise<UseCaseResult<QuoteDTO>> {
  const existing = await storage.getQuoteById(id)
  if (!existing) return notFound('quote', id)
  const transition = applyQuoteEvent(
    {
      version: existing.version,
      status: existing.status,
      totalHoursMin: existing.totalHoursMin,
      totalCostCents: existing.totalCostCents,
      discountBps: existing.discountBps,
      approvedAt: existing.approvedAt,
    },
    { kind: 'request_changes' },
  )
  if (!transition.ok) return state(transition.error.message)

  const newDraft = await storage.requestQuoteChanges({
    oldQuoteId: id,
    newQuoteId: newId(),
    newVersion: existing.version + 1,
    totalHoursMin: existing.totalHoursMin,
    totalCostCents: existing.totalCostCents,
    now: now(),
  })
  return ucOk(quoteDTO(newDraft))
}

// Parametric modules (project-scoped templates), line items, and
// milestones. Quote totals are recomputed on every item mutation so
// the UI never has to track them.

export async function listQuoteModulesForProject(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<QuoteModuleDTO[]>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const rows = await storage.listQuoteModulesForProject(proj.project.id)
  return ucOk(rows.map(quoteModuleDTO))
}

export async function createQuoteModule(
  { storage, newId, now }: CoreDeps,
  input: CreateQuoteModuleInput,
): Promise<UseCaseResult<QuoteModuleDTO>> {
  const proj = await storage.getProjectByCode(input.projectCode)
  if (!proj) return notFound('project', input.projectCode)
  const row = await storage.createQuoteModule({
    id: newId(),
    projectId: proj.project.id,
    name: input.name,
    description: input.description ?? null,
    defaultHoursJson: JSON.stringify(input.defaultHours ?? {}),
    defaultMarginBps: input.defaultMarginBps ?? 0,
    sortOrder: input.sortOrder ?? 0,
    now: now(),
  })
  return ucOk(quoteModuleDTO(row))
}

export async function patchQuoteModule(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchQuoteModuleInput,
): Promise<UseCaseResult<QuoteModuleDTO>> {
  const existing = await storage.getQuoteModuleById(id)
  if (!existing) return notFound('quote_module', id)
  const row = await storage.patchQuoteModule({
    id,
    patch: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.defaultHours !== undefined
        ? { defaultHoursJson: JSON.stringify(input.defaultHours) }
        : {}),
      ...(input.defaultMarginBps !== undefined ? { defaultMarginBps: input.defaultMarginBps } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    now: now(),
  })
  return ucOk(quoteModuleDTO(row))
}

export async function deleteQuoteModule(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getQuoteModuleById(id)
  if (!existing) return notFound('quote_module', id)
  await storage.softDeleteQuoteModule(id, now())
  return ucOk({ ok: true })
}

export async function listQuoteItems(
  { storage }: CoreDeps,
  quoteId: string,
): Promise<UseCaseResult<QuoteItemDTO[]>> {
  const rows = await storage.listQuoteItems(quoteId)
  return ucOk(rows.map(quoteItemDTO))
}

export async function createQuoteItem(
  { storage, newId, now }: CoreDeps,
  input: CreateQuoteItemInput,
): Promise<UseCaseResult<QuoteItemDTO>> {
  const quote = await storage.getQuoteById(input.quoteId)
  if (!quote) return notFound('quote', input.quoteId)
  if (quote.status !== 'draft') {
    return state(`quote ${input.quoteId} is not draft (status=${quote.status})`)
  }
  // Default sortOrder = max(siblings) + 10 so the new item lands at the
  // bottom of the list AND adjacent rows have enough gap that an up/down
  // swap (which trades sortOrder values) actually changes the ordering.
  let sortOrder = input.sortOrder
  if (sortOrder === undefined) {
    const siblings = await storage.listQuoteItems(input.quoteId)
    const maxSort = siblings.reduce((acc, s) => Math.max(acc, s.sortOrder), 0)
    sortOrder = maxSort + 10
  }
  const row = await storage.createQuoteItem({
    id: newId(),
    quoteId: input.quoteId,
    moduleId: input.moduleId ?? null,
    label: input.label,
    description: input.description ?? null,
    hoursMin: input.hoursMin,
    rateCents: input.rateCents,
    marginBps: input.marginBps ?? 0,
    sortOrder,
    now: now(),
  })
  await storage.recomputeQuoteTotals(input.quoteId, now())
  return ucOk(quoteItemDTO(row))
}

export async function patchQuoteItem(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchQuoteItemInput,
): Promise<UseCaseResult<QuoteItemDTO>> {
  const existing = await storage.getQuoteItemById(id)
  if (!existing) return notFound('quote_item', id)
  const quote = await storage.getQuoteById(existing.quoteId)
  if (!quote) return notFound('quote', existing.quoteId)
  if (quote.status !== 'draft') {
    return state(`quote ${quote.id} is not draft (status=${quote.status})`)
  }
  const row = await storage.patchQuoteItem({
    id,
    patch: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.hoursMin !== undefined ? { hoursMin: input.hoursMin } : {}),
      ...(input.rateCents !== undefined ? { rateCents: input.rateCents } : {}),
      ...(input.marginBps !== undefined ? { marginBps: input.marginBps } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    now: now(),
  })
  await storage.recomputeQuoteTotals(existing.quoteId, now())
  return ucOk(quoteItemDTO(row))
}

export async function deleteQuoteItem(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getQuoteItemById(id)
  if (!existing) return notFound('quote_item', id)
  const quote = await storage.getQuoteById(existing.quoteId)
  if (!quote) return notFound('quote', existing.quoteId)
  if (quote.status !== 'draft') {
    return state(`quote ${quote.id} is not draft (status=${quote.status})`)
  }
  await storage.deleteQuoteItem(id)
  await storage.recomputeQuoteTotals(existing.quoteId, now())
  return ucOk({ ok: true })
}

export async function listQuoteMilestones(
  { storage }: CoreDeps,
  quoteId: string,
): Promise<UseCaseResult<QuoteMilestoneDTO[]>> {
  const rows = await storage.listQuoteMilestones(quoteId)
  return ucOk(rows.map(quoteMilestoneDTO))
}

export async function createQuoteMilestone(
  { storage, newId, now }: CoreDeps,
  input: CreateQuoteMilestoneInput,
): Promise<UseCaseResult<QuoteMilestoneDTO>> {
  const quote = await storage.getQuoteById(input.quoteId)
  if (!quote) return notFound('quote', input.quoteId)
  if (quote.status !== 'draft') {
    return state(`quote ${input.quoteId} is not draft (status=${quote.status})`)
  }
  let sortOrder = input.sortOrder
  if (sortOrder === undefined) {
    const siblings = await storage.listQuoteMilestones(input.quoteId)
    const maxSort = siblings.reduce((acc, s) => Math.max(acc, s.sortOrder), 0)
    sortOrder = maxSort + 10
  }
  const row = await storage.createQuoteMilestone({
    id: newId(),
    quoteId: input.quoteId,
    label: input.label,
    description: input.description ?? null,
    percentageBps: input.percentageBps,
    gateType: input.gateType ?? null,
    sortOrder,
    now: now(),
  })
  return ucOk(quoteMilestoneDTO(row))
}

export async function patchQuoteMilestone(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchQuoteMilestoneInput,
): Promise<UseCaseResult<QuoteMilestoneDTO>> {
  const existing = await storage.getQuoteMilestoneById(id)
  if (!existing) return notFound('quote_milestone', id)
  const quote = await storage.getQuoteById(existing.quoteId)
  if (!quote) return notFound('quote', existing.quoteId)
  if (quote.status !== 'draft') {
    return state(`quote ${quote.id} is not draft (status=${quote.status})`)
  }
  const row = await storage.patchQuoteMilestone({
    id,
    patch: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.percentageBps !== undefined ? { percentageBps: input.percentageBps } : {}),
      ...(input.gateType !== undefined ? { gateType: input.gateType } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    now: now(),
  })
  return ucOk(quoteMilestoneDTO(row))
}

export async function deleteQuoteMilestone(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getQuoteMilestoneById(id)
  if (!existing) return notFound('quote_milestone', id)
  const quote = await storage.getQuoteById(existing.quoteId)
  if (!quote) return notFound('quote', existing.quoteId)
  if (quote.status !== 'draft') {
    return state(`quote ${quote.id} is not draft (status=${quote.status})`)
  }
  await storage.deleteQuoteMilestone(id)
  return ucOk({ ok: true })
}
