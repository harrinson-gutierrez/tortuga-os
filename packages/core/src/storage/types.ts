/**
 * Internal entity rows as the Storage port returns them.
 *
 * These are deliberately framework-free (no Drizzle types). The shapes are
 * almost identical to the DTOs in @tortuga-os/contracts but represent the
 * raw entity, not the wire format. Mappers in transports translate one to
 * the other.
 */

import type {
  AgentKind,
  AgentProvider,
  AgentRunStatus,
  Currency,
  DiscoveryMessageRole,
  DiscoveryProvider,
  DiscoveryStatus,
  EvidenceKind,
  EvidenceType,
  GateStatus,
  GateType,
  InboxKind,
  IterationOutcome,
  PhaseStatus,
  PhaseType,
  ProjectEnvironment,
  ProjectStack,
  ProjectStatus,
  QuoteStatus,
  ReworkRootCause,
  Role,
  StoryStatus,
  TaskStatus,
  TaskType,
  TroubleshootStatus,
} from '@tortuga-os/domain'

export type { InboxKind, ProjectEnvironment } from '@tortuga-os/domain'

export interface ClientRow {
  id: string
  name: string
  taxId: string | null
  contactEmail: string | null
  driveFolderId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface PersonRow {
  id: string
  name: string
  email: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ProjectRow {
  id: string
  code: string
  clientId: string
  name: string
  description: string | null
  status: ProjectStatus
  currency: Currency
  stack: ProjectStack
  workspacePath: string | null
  startedAt: number | null
  closedAt: number | null
  disabledSkillsJson: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface PhaseRow {
  id: string
  projectId: string
  type: PhaseType
  status: PhaseStatus
  iteration: number
  ownerRole: Role
  artifactPath: string | null
  startedAt: number | null
  closedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface QuoteRow {
  id: string
  phaseId: string
  version: number
  status: QuoteStatus
  totalHoursMin: number
  totalCostCents: number
  discountBps: number
  approvedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface StoryRow {
  id: string
  quoteId: string
  code: string
  title: string
  goal: string
  acceptanceCriteriaJson: string
  inputsJson: string
  outputsJson: string
  verificationJson: string
  outOfScopeJson: string
  estimatedHoursMin: number
  actualHoursMin: number
  status: StoryStatus
  priority: number
  ownerRole: Role
  createdAt: number
  updatedAt: number
}

export interface TaskRow {
  id: string
  code: string
  storyId: string
  type: TaskType
  ownerRole: Role
  assignee: string | null
  status: TaskStatus
  currentIteration: number
  estimatedHoursMin: number
  actualHoursMin: number
  createdAt: number
  updatedAt: number
}

export interface IterationRow {
  id: string
  taskId: string
  n: number
  startedAt: number
  closedAt: number | null
  outcome: IterationOutcome | null
  closedByRole: Role | null
  notes: string | null
  createdAt: number
  updatedAt: number
}

export interface ReworkTicketRow {
  id: string
  iterationId: string
  triggeredByPhase: PhaseType
  rootCausePhase: ReworkRootCause
  rootCauseRole: Role
  weight: number
  description: string
  artifactRef: string | null
  hoursSpentMin: number
  costCents: number
  createdAt: number
  updatedAt: number
}

export interface EvidenceRow {
  id: string
  taskId: string
  iterationId: string
  type: EvidenceType
  kind: EvidenceKind
  path: string
  createdByRole: Role
  createdByAssignee: string | null
  notes: string | null
  createdAt: number
  updatedAt: number
}

export interface GateRow {
  id: string
  taskId: string
  iterationId: string
  gateType: GateType
  status: GateStatus
  outputPath: string | null
  ranAt: number | null
  createdAt: number
  updatedAt: number
}

export interface RoleRateRow {
  id: Role
  defaultHourlyRateCents: number
}

export interface ProjectRoleRateRow {
  id: string
  projectId: string
  role: Role
  hourlyRateCents: number
}

export interface WorkEntryRow {
  id: string
  iterationId: string
  taskId: string
  personId: string
  role: Role
  minutes: number
  reworkTicketId: string | null
  notes: string | null
  loggedAt: number
  createdAt: number
  updatedAt: number
}

export interface AgentRunRow {
  id: string
  taskId: string
  iterationId: string
  agentKind: AgentKind
  provider: AgentProvider
  model: string
  status: AgentRunStatus
  systemPrompt: string
  userPrompt: string
  output: string | null
  errorMessage: string | null
  tokensIn: number
  tokensOut: number
  costCents: number
  startedAt: number | null
  closedAt: number | null
  workEntryId: string | null
  evidenceId: string | null
  createdAt: number
  updatedAt: number
}

export interface DiscoveryConversationRow {
  id: string
  projectId: string
  status: DiscoveryStatus
  provider: DiscoveryProvider
  cliSessionId: string | null
  storiesDraftJson: string | null
  approvedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface DiscoveryMessageRow {
  id: string
  conversationId: string
  role: DiscoveryMessageRole
  content: string
  model: string | null
  tokensIn: number
  tokensOut: number
  costCents: number
  createdAt: number
  updatedAt: number
}

export interface QuoteModuleRow {
  id: string
  projectId: string
  name: string
  description: string | null
  defaultHoursJson: string
  defaultMarginBps: number
  sortOrder: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface QuoteItemRow {
  id: string
  quoteId: string
  moduleId: string | null
  label: string
  description: string | null
  hoursMin: number
  rateCents: number
  marginBps: number
  subtotalCents: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface QuoteMilestoneRow {
  id: string
  quoteId: string
  label: string
  description: string | null
  percentageBps: number
  gateType: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface KitTemplateRow {
  id: string
  name: string
  description: string | null
  stack: string
  snapshotJson: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type ExpenseCategory =
  | 'contractor'
  | 'saas'
  | 'hosting'
  | 'license'
  | 'hardware'
  | 'travel'
  | 'other'

export interface ExpenseRow {
  id: string
  projectId: string
  category: ExpenseCategory
  vendor: string | null
  description: string
  amountCents: number
  incurredOn: string
  receiptPath: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface SecretRow {
  id: string
  projectId: string
  name: string
  description: string | null
  valueCiphertext: string
  iv: string
  authTag: string
  createdAt: number
  updatedAt: number
}

export type McpTransport = 'stdio' | 'http'

export interface InboxItemRow {
  id: string
  kind: InboxKind
  title: string
  body: string | null
  projectId: string | null
  taskId: string | null
  runId: string | null
  readAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ProjectEnvRow {
  id: string
  projectId: string
  environment: ProjectEnvironment
  name: string
  value: string
  description: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface ProjectMcpRow {
  id: string
  projectId: string
  name: string
  description: string | null
  transport: McpTransport
  enabled: boolean
  command: string
  argsJson: string
  envJson: string
  url: string | null
  headersJson: string
  presetId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface TroubleshootReportRow {
  id: string
  taskId: string
  parentReportId: string | null
  status: TroubleshootStatus
  errorText: string
  contextNote: string | null
  beforeScreenshotPath: string | null
  afterScreenshotPath: string | null
  lastDiagnosisRunId: string | null
  diagnosisJson: string | null
  requiredActionsJson: string
  attemptCount: number
  lastTestOutput: string | null
  resolvedAt: number | null
  createdAt: number
  updatedAt: number
}

export type StepAckKind = 'ok' | 'fail'

export interface StepAckRow {
  id: string
  taskId: string
  iterationN: number
  stepId: string
  ack: StepAckKind
  ackedByRole: Role
  notes: string | null
  ackedAt: number
  createdAt: number
  updatedAt: number
}
