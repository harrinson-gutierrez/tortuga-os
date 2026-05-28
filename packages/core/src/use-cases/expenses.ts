/**
 * Per-project expenses. Together with the approved quote total they
 * power the real-margin report: margin = quoted - Σ(expenses).
 */

import type {
  CreateExpenseInput,
  ExpenseDTO,
  PatchExpenseInput,
  ProjectMarginDTO,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { expenseDTO } from '../mappers'

export async function listExpensesForProject(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<ExpenseDTO[]>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const rows = await storage.listExpensesForProject(proj.project.id)
  return ucOk(rows.map(expenseDTO))
}

export async function createExpense(
  { storage, newId, now }: CoreDeps,
  input: CreateExpenseInput,
): Promise<UseCaseResult<ExpenseDTO>> {
  const proj = await storage.getProjectByCode(input.projectCode)
  if (!proj) return notFound('project', input.projectCode)
  const row = await storage.createExpense({
    id: newId(),
    projectId: proj.project.id,
    category: input.category,
    vendor: input.vendor ?? null,
    description: input.description,
    amountCents: input.amountCents,
    incurredOn: input.incurredOn,
    receiptPath: input.receiptPath ?? null,
    now: now(),
  })
  return ucOk(expenseDTO(row))
}

export async function patchExpense(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchExpenseInput,
): Promise<UseCaseResult<ExpenseDTO>> {
  const existing = await storage.getExpenseById(id)
  if (!existing) return notFound('expense', id)
  const row = await storage.patchExpense({
    id,
    patch: {
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.vendor !== undefined ? { vendor: input.vendor } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.incurredOn !== undefined ? { incurredOn: input.incurredOn } : {}),
      ...(input.receiptPath !== undefined ? { receiptPath: input.receiptPath } : {}),
    },
    now: now(),
  })
  return ucOk(expenseDTO(row))
}

export async function deleteExpense(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getExpenseById(id)
  if (!existing) return notFound('expense', id)
  await storage.softDeleteExpense(id, now())
  return ucOk({ ok: true })
}

/**
 * Project margin = approved quote total - Σ(expenses). Returns 0 quote
 * if no quote exists yet (a freshly-created project). Margin in cents
 * AND in basis points for the UI to show "12.5% margin" without doing
 * the math itself.
 */
export async function getProjectMargin(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<ProjectMarginDTO>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const salesPhase = await storage.getSalesPhase(proj.project.id)
  let quotedCents = 0
  if (salesPhase) {
    const quote = await storage.getLatestQuoteForSalesPhase(salesPhase.id)
    if (quote) {
      // Apply discount if any.
      const gross = quote.totalCostCents
      const net = Math.round(gross * (1 - quote.discountBps / 10000))
      quotedCents = net
    }
  }
  const expensesCents = await storage.sumExpensesForProject(proj.project.id)
  const marginCents = quotedCents - expensesCents
  const marginBps = quotedCents > 0 ? Math.round((marginCents / quotedCents) * 10000) : 0
  return ucOk({
    projectCode,
    quotedCents,
    expensesCents,
    marginCents,
    marginBps,
  })
}
