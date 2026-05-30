// Wire-format DTOs for the consulting workflow domain.
// Consumed by sidecar handlers and by frontend apps (desktop, web).
// These mirror packages/db/src/schema.ts but stay framework-free.

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
  IterationOutcome,
  PhaseStatus,
  PhaseType,
  ProjectStack,
  ProjectStatus,
  QuoteStatus,
  ReworkRootCause,
  Role,
  StoryStatus,
  TaskConversationStatus,
  TaskCoworkerPhase,
  TaskExecutionMode,
  TaskStatus,
  TaskType,
} from './enums'
import type { DesignFrameStatus, DesignTokens } from './schemas/design-frames'
import type { InboxKind } from './schemas/inbox'
import type { ProjectEnvironment } from './schemas/project-envs'

export interface ClientDTO {
  id: string
  name: string
  taxId: string | null
  contactEmail: string | null
  driveFolderId: string | null
  createdAt: number
  updatedAt: number
}

export interface PersonDTO {
  id: string
  name: string
  email: string | null
  createdAt: number
  updatedAt: number
}

export interface ProjectDTO {
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
  createdAt: number
  updatedAt: number
}

export interface ProjectWithClientDTO extends ProjectDTO {
  client: ClientDTO
}

export interface RoleRateDTO {
  role: Role
  hourlyRateCents: number
}

export interface ProjectRoleRateDTO {
  projectId: string
  role: Role
  hourlyRateCents: number
}

export interface PhaseDTO {
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

export interface QuoteDTO {
  id: string
  phaseId: string
  version: number
  status: QuoteStatus
  totalHoursMin: number
  /** Gross total (sum of item subtotals). */
  totalCostCents: number
  /** Global discount in basis points (1% = 100). */
  discountBps: number
  approvedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface AcceptanceCriterion {
  id: string
  given: string
  when: string
  then: string
}

export interface StoryInputs {
  design?: {
    figmaFileKey?: string
    figmaNodeIds?: string[]
  }
  apiContract?: string
  brandTokens?: string
  references?: string[]
}

export interface StoryOutputs {
  files?: string[]
  endpoints?: string[]
  evidence?: Array<{ type: EvidenceType; description: string }>
}

export interface StoryVerification {
  gates: GateType[]
  manualChecks: string[]
}

export interface StoryDTO {
  id: string
  quoteId: string
  code: string
  title: string
  goal: string
  acceptanceCriteria: AcceptanceCriterion[]
  inputs: StoryInputs
  outputs: StoryOutputs
  verification: StoryVerification
  outOfScope: string[]
  estimatedHoursMin: number
  actualHoursMin: number
  status: StoryStatus
  priority: number
  ownerRole: Role
  createdAt: number
  updatedAt: number
}

export interface TaskDTO {
  id: string
  code: string
  storyId: string
  type: TaskType
  ownerRole: Role
  assignee: string | null
  status: TaskStatus
  executionMode: TaskExecutionMode
  currentIteration: number
  estimatedHoursMin: number
  actualHoursMin: number
  createdAt: number
  updatedAt: number
}

export interface IterationDTO {
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

export interface ReworkTicketDTO {
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

export interface EvidenceDTO {
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

export interface GateDTO {
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

export interface GateExecutionDTO {
  gateType: GateType
  status: 'passed' | 'failed' | 'skipped'
  exitCode: number | null
  durationMs: number
  outputPath: string | null
  reason?: string
}

export interface RunGatesResultDTO {
  taskId: string
  iterationId: string
  stack: 'flutter' | 'nextjs' | 'vite-react' | 'angular' | 'astro' | 'node'
  executions: GateExecutionDTO[]
  gates: GateDTO[]
}

export interface AssignmentDTO {
  id: string
  taskId: string
  personId: string
  role: Role
  createdAt: number
  updatedAt: number
}

export interface WorkEntryDTO {
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

/** Workspace tree views (on-disk project root). */

export interface WorkspaceFileNodeDTO {
  name: string
  path: string
  type: 'file'
  sizeBytes: number
  modifiedAt: number
}

export interface WorkspaceDirNodeDTO {
  name: string
  path: string
  type: 'dir'
  modifiedAt: number
  children: WorkspaceNodeDTO[]
}

export type WorkspaceNodeDTO = WorkspaceFileNodeDTO | WorkspaceDirNodeDTO

export interface WorkspaceTreeDTO {
  projectCode: string
  /** Absolute path of the workspace if it exists on disk, else null. */
  root: string | null
  /**
   * Absolute path the workspace *would* live at (project.workspacePath or
   * the convention-derived path). Always set, even when `root` is null,
   * so the UI can show the operator where to look.
   */
  attemptedPath: string | null
  tree: WorkspaceNodeDTO[]
}

export interface WorkspaceFileDTO {
  path: string
  sizeBytes: number
  content: string
  binary: boolean
  truncated: boolean
}

export interface QaVerdictDTO {
  verdict: 'APPROVED' | 'REJECTED'
  acceptanceCriteria: string
  defects: string
  notes: string
}

export interface QaVerdictResponseDTO {
  runId: string
  source: 'json' | 'markdown' | 'none'
  verdict: QaVerdictDTO | null
  rawOutput: string
}

/** Aggregate views used by reports. */

export interface PhaseCostBreakdownDTO {
  phase: PhaseType
  cleanHoursMin: number
  reworkHoursAttributedMin: number
  cleanCostCents: number
  reworkCostAttributedCents: number
}

export interface ProjectCostReportDTO {
  projectId: string
  projectCode: string
  budgetCents: number
  spentCents: number
  reworkCostCents: number
  clientReworkCostCents: number
  /** Manually-entered expenses (contractors, SaaS, hosting…). */
  expensesCents: number
  /** AI/agent spend aggregated across all runs of the project. */
  aiCostCents: number
  aiTokensIn: number
  aiTokensOut: number
  aiRunCount: number
  /** budget − labor spent − expenses − AI cost. Can be negative. */
  marginCents: number
  byPhase: PhaseCostBreakdownDTO[]
  generatedAt: number
}

export interface AgentRunDTO {
  id: string
  taskId: string | null
  iterationId: string | null
  projectId: string | null
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

/** Stories proposed by the discovery agent before being materialized. */
export interface DiscoveryStoryDraftDTO {
  title: string
  goal: string
  acceptanceCriteria: string[]
  estimatedHours: number
  priority: 1 | 2 | 3 | 4 | 5
}

export interface DiscoveryConversationDTO {
  id: string
  projectId: string
  status: DiscoveryStatus
  provider: DiscoveryProvider
  cliSessionId: string | null
  storiesDraft: DiscoveryStoryDraftDTO[] | null
  approvedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface DiscoveryMessageDTO {
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

export interface DiscoveryConversationWithMessagesDTO {
  conversation: DiscoveryConversationDTO
  messages: DiscoveryMessageDTO[]
}

/** Coworker mode: turn-based conversation that drives a build task. */
export interface TaskConversationDTO {
  id: string
  taskId: string
  status: TaskConversationStatus
  provider: DiscoveryProvider
  cliSessionId: string | null
  phase: TaskCoworkerPhase
  createdAt: number
  updatedAt: number
}

export interface TaskMessageDTO {
  id: string
  conversationId: string
  role: DiscoveryMessageRole
  content: string
  /** The agent run this turn produced (null for user messages). */
  agentRunId: string | null
  phase: TaskCoworkerPhase | null
  model: string | null
  tokensIn: number
  tokensOut: number
  costCents: number
  createdAt: number
  updatedAt: number
}

export interface TaskConversationWithMessagesDTO {
  conversation: TaskConversationDTO
  messages: TaskMessageDTO[]
}

export interface QuoteModuleDTO {
  id: string
  projectId: string
  name: string
  description: string | null
  defaultHours: Record<string, number>
  defaultMarginBps: number
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface QuoteItemDTO {
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

export interface QuoteMilestoneDTO {
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

export interface KitTemplateDTO {
  id: string
  name: string
  description: string | null
  stack: string
  /** Parsed snapshot (stories, modules, milestones). */
  snapshot: {
    stories?: Array<{
      code?: string
      title: string
      goal: string
      acceptanceCriteria?: string[]
      estimatedHoursMin?: number
    }>
    modules?: Array<{
      name: string
      description?: string
      defaultHoursByRole?: Record<string, number>
      defaultMarginBps?: number
    }>
    milestones?: Array<{
      label: string
      description?: string
      percentageBps: number
    }>
  }
  createdAt: number
  updatedAt: number
}

// ExpenseCategory enum lives in schemas/expenses.ts (zod) and is
// re-exported from contracts/index. Don't redefine here.

export interface ExpenseDTO {
  id: string
  projectId: string
  category: 'contractor' | 'saas' | 'hosting' | 'license' | 'hardware' | 'travel' | 'other'
  vendor: string | null
  description: string
  amountCents: number
  incurredOn: string
  receiptPath: string | null
  createdAt: number
  updatedAt: number
}

export interface ProjectMarginDTO {
  projectCode: string
  quotedCents: number
  expensesCents: number
  marginCents: number
  marginBps: number
}

export interface SecretDTO {
  id: string
  projectId: string
  name: string
  description: string | null
  /**
   * The plaintext value is NEVER returned by the API. Use the special
   * /secrets/:id/reveal endpoint to get it back (which logs the access).
   */
  hasValue: boolean
  createdAt: number
  updatedAt: number
}

export interface InboxItemDTO {
  id: string
  kind: InboxKind
  title: string
  body: string | null
  projectId: string | null
  taskId: string | null
  runId: string | null
  /** unix-ms when the operator dismissed the item. null = unread. */
  readAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ProjectEnvDTO {
  id: string
  projectId: string
  environment: ProjectEnvironment
  name: string
  value: string
  description: string | null
  createdAt: number
  updatedAt: number
}

export interface ProjectMcpDTO {
  id: string
  projectId: string
  name: string
  description: string | null
  transport: 'stdio' | 'http'
  enabled: boolean
  command: string
  args: string[]
  env: Record<string, string>
  url: string | null
  headers: Record<string, string>
  presetId: string | null
  createdAt: number
  updatedAt: number
}

export interface DesignFrameDTO {
  id: string
  projectId: string
  storyId: string | null
  figmaFileKey: string
  figmaNodeId: string
  name: string
  tokens: DesignTokens
  baselineScreenshotPath: string | null
  status: DesignFrameStatus
  fidelityPct: number | null
  createdAt: number
  updatedAt: number
}
