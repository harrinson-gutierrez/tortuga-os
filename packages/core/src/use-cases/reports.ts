import type { ProjectCostReportDTO } from '@tortuga-os/contracts'
import {
  type RateLookup,
  type ReworkTicketInput,
  type WorkEntryInput,
  imputeReworkCost,
} from '@tortuga-os/domain'
import type { Role } from '@tortuga-os/domain'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'

async function buildRateLookup(
  storage: CoreDeps['storage'],
  projectId: string,
): Promise<RateLookup> {
  const defaults = await storage.listDefaultRoleRates()
  const overrides = await storage.listProjectRoleRates(projectId)
  const map = new Map<Role, number>()
  for (const r of defaults) map.set(r.id, r.defaultHourlyRateCents)
  for (const o of overrides) map.set(o.role, o.hourlyRateCents)
  return (role) => map.get(role) ?? 0
}

export async function getProjectCostReport(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<ProjectCostReportDTO>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const project = proj.project

  const rate = await buildRateLookup(storage, project.id)

  const salesPhase = await storage.getSalesPhase(project.id)
  let budgetCents = 0
  if (salesPhase) {
    const latest = await storage.getLatestQuoteForSalesPhase(salesPhase.id)
    if (latest?.status === 'approved') budgetCents = latest.totalCostCents
  }

  const rawEntries = await storage.listProjectWorkEntriesWithPhase(project.id)
  const workEntries: WorkEntryInput[] = rawEntries.map((e) => ({
    minutes: e.entry.minutes,
    role: e.entry.role,
    reworkTicketId: e.entry.reworkTicketId,
    executingPhase: e.phase,
  }))

  // Storage will eventually expose rework tickets too; until then the
  // imputation runs with an empty ticket map (all entries are treated as
  // clean, which is the safe default).
  const ticketsById: Record<string, ReworkTicketInput> = {}

  const cost = imputeReworkCost(workEntries, ticketsById, rate)

  const expensesCents = await storage.sumExpensesForProject(project.id)
  const ai = await storage.sumAgentRunCostForProject(project.id)
  const marginCents = budgetCents - cost.spentCents - expensesCents - ai.costCents

  return ucOk({
    projectId: project.id,
    projectCode: project.code,
    budgetCents,
    spentCents: cost.spentCents,
    reworkCostCents: cost.reworkCostCents,
    clientReworkCostCents: cost.clientReworkCostCents,
    expensesCents,
    aiCostCents: ai.costCents,
    aiTokensIn: ai.tokensIn,
    aiTokensOut: ai.tokensOut,
    aiRunCount: ai.runCount,
    marginCents,
    byPhase: cost.byPhase.map((p) => ({
      phase: p.phase,
      cleanHoursMin: p.cleanMinutes,
      reworkHoursAttributedMin: p.reworkAttributedMinutes,
      cleanCostCents: p.cleanCostCents,
      reworkCostAttributedCents: p.reworkAttributedCostCents,
    })),
    generatedAt: Date.now(),
  })
}
