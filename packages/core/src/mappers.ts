/**
 * Map row shapes (Storage port output) to DTOs (wire format from contracts).
 *
 * Kept tiny on purpose. If a row shape gains a column the DTO doesn't
 * expose, the mapper is the only place to update.
 */

import type {
  AgentRunDTO,
  ClientDTO,
  DesignFrameDTO,
  DesignTokens,
  DiscoveryConversationDTO,
  DiscoveryMessageDTO,
  DiscoveryStoryDraftDTO,
  EvidenceDTO,
  ExpenseDTO,
  GateDTO,
  InboxItemDTO,
  IterationDTO,
  KitTemplateDTO,
  PersonDTO,
  PhaseDTO,
  ProjectDTO,
  ProjectEnvDTO,
  ProjectMcpDTO,
  ProjectWithClientDTO,
  QuoteDTO,
  QuoteItemDTO,
  QuoteMilestoneDTO,
  QuoteModuleDTO,
  RequiredOperatorAction,
  SecretDTO,
  StoryDTO,
  TaskDTO,
  TroubleshootReportDTO,
  WorkEntryDTO,
} from '@tortuga-os/contracts'
import {
  DesignTokens as DesignTokensSchema,
  RequiredOperatorAction as RequiredOperatorActionSchema,
  TroubleshootDiagnosis,
} from '@tortuga-os/contracts'
import type {
  AgentRunRow,
  ClientRow,
  DesignFrameRow,
  DiscoveryConversationRow,
  DiscoveryMessageRow,
  EvidenceRow,
  ExpenseRow,
  GateRow,
  InboxItemRow,
  IterationRow,
  KitTemplateRow,
  PersonRow,
  PhaseRow,
  ProjectEnvRow,
  ProjectMcpRow,
  ProjectRow,
  QuoteItemRow,
  QuoteMilestoneRow,
  QuoteModuleRow,
  QuoteRow,
  SecretRow,
  StoryRow,
  TaskRow,
  TroubleshootReportRow,
  WorkEntryRow,
} from './storage/types'

export const clientDTO = (c: ClientRow): ClientDTO => ({
  id: c.id,
  name: c.name,
  taxId: c.taxId,
  contactEmail: c.contactEmail,
  driveFolderId: c.driveFolderId,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
})

export const personDTO = (p: PersonRow): PersonDTO => ({
  id: p.id,
  name: p.name,
  email: p.email,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

export const projectDTO = (p: ProjectRow): ProjectDTO => ({
  id: p.id,
  code: p.code,
  clientId: p.clientId,
  name: p.name,
  description: p.description,
  status: p.status,
  currency: p.currency,
  stack: p.stack,
  workspacePath: p.workspacePath,
  startedAt: p.startedAt,
  closedAt: p.closedAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

export const projectWithClientDTO = (p: ProjectRow, c: ClientRow): ProjectWithClientDTO => ({
  ...projectDTO(p),
  client: clientDTO(c),
})

export const phaseDTO = (p: PhaseRow): PhaseDTO => ({
  id: p.id,
  projectId: p.projectId,
  type: p.type,
  status: p.status,
  iteration: p.iteration,
  ownerRole: p.ownerRole,
  artifactPath: p.artifactPath,
  startedAt: p.startedAt,
  closedAt: p.closedAt,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

export const quoteDTO = (q: QuoteRow): QuoteDTO => ({
  id: q.id,
  phaseId: q.phaseId,
  version: q.version,
  status: q.status,
  totalHoursMin: q.totalHoursMin,
  totalCostCents: q.totalCostCents,
  discountBps: q.discountBps,
  approvedAt: q.approvedAt,
  createdAt: q.createdAt,
  updatedAt: q.updatedAt,
})

function parseJsonOr<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const storyDTO = (s: StoryRow): StoryDTO => ({
  id: s.id,
  quoteId: s.quoteId,
  code: s.code,
  title: s.title,
  goal: s.goal,
  acceptanceCriteria: parseJsonOr(s.acceptanceCriteriaJson, [] as StoryDTO['acceptanceCriteria']),
  inputs: parseJsonOr(s.inputsJson, {} as StoryDTO['inputs']),
  outputs: parseJsonOr(s.outputsJson, {} as StoryDTO['outputs']),
  verification: parseJsonOr(s.verificationJson, {
    gates: [],
    manualChecks: [],
  } as StoryDTO['verification']),
  outOfScope: parseJsonOr(s.outOfScopeJson, [] as string[]),
  estimatedHoursMin: s.estimatedHoursMin,
  actualHoursMin: s.actualHoursMin,
  status: s.status,
  priority: s.priority,
  ownerRole: s.ownerRole,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
})

export const taskDTO = (t: TaskRow): TaskDTO => ({
  id: t.id,
  code: t.code,
  storyId: t.storyId,
  type: t.type,
  ownerRole: t.ownerRole,
  assignee: t.assignee,
  status: t.status,
  currentIteration: t.currentIteration,
  estimatedHoursMin: t.estimatedHoursMin,
  actualHoursMin: t.actualHoursMin,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
})

export const iterationDTO = (i: IterationRow): IterationDTO => ({
  id: i.id,
  taskId: i.taskId,
  n: i.n,
  startedAt: i.startedAt,
  closedAt: i.closedAt,
  outcome: i.outcome,
  closedByRole: i.closedByRole,
  notes: i.notes,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
})

export const evidenceDTO = (e: EvidenceRow): EvidenceDTO => ({
  id: e.id,
  taskId: e.taskId,
  iterationId: e.iterationId,
  type: e.type,
  kind: e.kind,
  path: e.path,
  createdByRole: e.createdByRole,
  createdByAssignee: e.createdByAssignee,
  notes: e.notes,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
})

export const gateDTO = (g: GateRow): GateDTO => ({
  id: g.id,
  taskId: g.taskId,
  iterationId: g.iterationId,
  gateType: g.gateType,
  status: g.status,
  outputPath: g.outputPath,
  ranAt: g.ranAt,
  createdAt: g.createdAt,
  updatedAt: g.updatedAt,
})

export const workEntryDTO = (w: WorkEntryRow): WorkEntryDTO => ({
  id: w.id,
  iterationId: w.iterationId,
  taskId: w.taskId,
  personId: w.personId,
  role: w.role,
  minutes: w.minutes,
  reworkTicketId: w.reworkTicketId,
  notes: w.notes,
  loggedAt: w.loggedAt,
  createdAt: w.createdAt,
  updatedAt: w.updatedAt,
})

export const agentRunDTO = (a: AgentRunRow): AgentRunDTO => ({
  id: a.id,
  taskId: a.taskId,
  iterationId: a.iterationId,
  agentKind: a.agentKind,
  provider: a.provider,
  model: a.model,
  status: a.status,
  systemPrompt: a.systemPrompt,
  userPrompt: a.userPrompt,
  output: a.output,
  errorMessage: a.errorMessage,
  tokensIn: a.tokensIn,
  tokensOut: a.tokensOut,
  costCents: a.costCents,
  startedAt: a.startedAt,
  closedAt: a.closedAt,
  workEntryId: a.workEntryId,
  evidenceId: a.evidenceId,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
})

function parseStoriesDraft(raw: string | null): DiscoveryStoryDraftDTO[] | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed as DiscoveryStoryDraftDTO[]
  } catch {
    return null
  }
}

export const discoveryConversationDTO = (
  c: DiscoveryConversationRow,
): DiscoveryConversationDTO => ({
  id: c.id,
  projectId: c.projectId,
  status: c.status,
  provider: c.provider,
  cliSessionId: c.cliSessionId,
  storiesDraft: parseStoriesDraft(c.storiesDraftJson),
  approvedAt: c.approvedAt,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
})

export const discoveryMessageDTO = (m: DiscoveryMessageRow): DiscoveryMessageDTO => ({
  id: m.id,
  conversationId: m.conversationId,
  role: m.role,
  content: m.content,
  model: m.model,
  tokensIn: m.tokensIn,
  tokensOut: m.tokensOut,
  costCents: m.costCents,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
})

function parseJsonObject(s: string, fallback: Record<string, string> = {}): Record<string, string> {
  try {
    const v = JSON.parse(s)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, string>
    return fallback
  } catch {
    return fallback
  }
}

function parseJsonStringArray(s: string): string[] {
  try {
    const v = JSON.parse(s)
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[]
    return []
  } catch {
    return []
  }
}

function parseJsonNumberRecord(s: string): Record<string, number> {
  try {
    const v = JSON.parse(s)
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out: Record<string, number> = {}
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'number' && Number.isFinite(val)) out[k] = val
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return {}
}

export const quoteModuleDTO = (m: QuoteModuleRow): QuoteModuleDTO => ({
  id: m.id,
  projectId: m.projectId,
  name: m.name,
  description: m.description,
  defaultHours: parseJsonNumberRecord(m.defaultHoursJson),
  defaultMarginBps: m.defaultMarginBps,
  sortOrder: m.sortOrder,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
})

export const quoteItemDTO = (i: QuoteItemRow): QuoteItemDTO => ({
  id: i.id,
  quoteId: i.quoteId,
  moduleId: i.moduleId,
  label: i.label,
  description: i.description,
  hoursMin: i.hoursMin,
  rateCents: i.rateCents,
  marginBps: i.marginBps,
  subtotalCents: i.subtotalCents,
  sortOrder: i.sortOrder,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
})

export const quoteMilestoneDTO = (m: QuoteMilestoneRow): QuoteMilestoneDTO => ({
  id: m.id,
  quoteId: m.quoteId,
  label: m.label,
  description: m.description,
  percentageBps: m.percentageBps,
  gateType: m.gateType,
  sortOrder: m.sortOrder,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
})

export const kitTemplateDTO = (k: KitTemplateRow): KitTemplateDTO => ({
  id: k.id,
  name: k.name,
  description: k.description,
  stack: k.stack,
  snapshot: (() => {
    try {
      const v = JSON.parse(k.snapshotJson)
      if (v && typeof v === 'object' && !Array.isArray(v)) return v
    } catch {
      /* fall through */
    }
    return {}
  })(),
  createdAt: k.createdAt,
  updatedAt: k.updatedAt,
})

/**
 * Parse tokens_json through the DesignTokens schema so the array sections
 * (colors/gradients/typography/shadows/borders) always come back as arrays
 * (their zod defaults), even for legacy rows or partial JSON. Falls back to
 * a fully-defaulted empty spec on parse failure.
 */
function parseDesignTokens(raw: string | null | undefined): DesignTokens {
  let parsed: unknown = {}
  try {
    if (raw) parsed = JSON.parse(raw)
  } catch {
    parsed = {}
  }
  const result = DesignTokensSchema.safeParse(parsed)
  return result.success ? result.data : DesignTokensSchema.parse({})
}

export const designFrameDTO = (d: DesignFrameRow): DesignFrameDTO => ({
  id: d.id,
  projectId: d.projectId,
  storyId: d.storyId,
  figmaFileKey: d.figmaFileKey,
  figmaNodeId: d.figmaNodeId,
  name: d.name,
  tokens: parseDesignTokens(d.tokensJson),
  baselineScreenshotPath: d.baselineScreenshotPath,
  status: d.status,
  fidelityPct: d.fidelityPct,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
})

export const expenseDTO = (e: ExpenseRow): ExpenseDTO => ({
  id: e.id,
  projectId: e.projectId,
  category: e.category,
  vendor: e.vendor,
  description: e.description,
  amountCents: e.amountCents,
  incurredOn: e.incurredOn,
  receiptPath: e.receiptPath,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
})

export const secretDTO = (s: SecretRow): SecretDTO => ({
  id: s.id,
  projectId: s.projectId,
  name: s.name,
  description: s.description,
  hasValue: s.valueCiphertext.length > 0,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
})

export const inboxItemDTO = (i: InboxItemRow): InboxItemDTO => ({
  id: i.id,
  kind: i.kind,
  title: i.title,
  body: i.body,
  projectId: i.projectId,
  taskId: i.taskId,
  runId: i.runId,
  readAt: i.readAt,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
})

export const projectEnvDTO = (e: ProjectEnvRow): ProjectEnvDTO => ({
  id: e.id,
  projectId: e.projectId,
  environment: e.environment,
  name: e.name,
  value: e.value,
  description: e.description,
  createdAt: e.createdAt,
  updatedAt: e.updatedAt,
})

export const projectMcpDTO = (m: ProjectMcpRow): ProjectMcpDTO => ({
  id: m.id,
  projectId: m.projectId,
  name: m.name,
  description: m.description,
  transport: m.transport,
  enabled: m.enabled,
  command: m.command,
  args: parseJsonStringArray(m.argsJson),
  env: parseJsonObject(m.envJson),
  url: m.url,
  headers: parseJsonObject(m.headersJson),
  presetId: m.presetId,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
})

function parseDiagnosis(raw: string | null): TroubleshootReportDTO['diagnosis'] {
  if (!raw) return null
  try {
    const parsed = TroubleshootDiagnosis.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function parseRequiredActions(raw: string): RequiredOperatorAction[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const arr = RequiredOperatorActionSchema.array().safeParse(parsed)
    return arr.success ? arr.data : []
  } catch {
    return []
  }
}

export const troubleshootReportDTO = (t: TroubleshootReportRow): TroubleshootReportDTO => ({
  id: t.id,
  taskId: t.taskId,
  parentReportId: t.parentReportId,
  status: t.status,
  errorText: t.errorText,
  contextNote: t.contextNote,
  beforeScreenshotPath: t.beforeScreenshotPath,
  afterScreenshotPath: t.afterScreenshotPath,
  lastDiagnosisRunId: t.lastDiagnosisRunId,
  diagnosis: parseDiagnosis(t.diagnosisJson),
  requiredActions: parseRequiredActions(t.requiredActionsJson),
  attemptCount: t.attemptCount,
  lastTestOutput: t.lastTestOutput,
  resolvedAt: t.resolvedAt,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
})
