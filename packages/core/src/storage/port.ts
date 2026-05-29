/**
 * Storage port.
 *
 * The interface `core` use-cases program against. An implementation lives
 * in `@tortuga-os/storage-sqlite` (Drizzle + better-sqlite3) but a
 * fake-in-memory adapter exists in `@tortuga-os/test-fixtures` so
 * use-cases can be tested without touching disk.
 *
 * Method naming is domain-driven, not SQL-driven: `approveQuoteAndOpenKickoff`
 * instead of `updateQuoteAndInsertPhase`. The atomicity of the operation
 * is part of the contract, not an implementation detail leaking out.
 */

import type {
  AgentKind,
  AgentProvider,
  AgentRunStatus,
  Currency,
  EvidenceKind,
  EvidenceType,
  GateStatus,
  GateType,
  InboxKind,
  IterationOutcome,
  PhaseType,
  ProjectEnvironment,
  Role,
  TaskStatus,
  TaskType,
  TroubleshootStatus,
} from '@tortuga-os/domain'
import type {
  AgentRunRow,
  ClientRow,
  DiscoveryConversationRow,
  DiscoveryMessageRow,
  EvidenceRow,
  ExpenseCategory,
  ExpenseRow,
  GateRow,
  InboxItemRow,
  IterationRow,
  KitTemplateRow,
  McpTransport,
  PersonRow,
  PhaseRow,
  ProjectEnvRow,
  ProjectMcpRow,
  ProjectRoleRateRow,
  ProjectRow,
  QuoteItemRow,
  QuoteMilestoneRow,
  QuoteModuleRow,
  QuoteRow,
  RoleRateRow,
  SecretRow,
  StepAckKind,
  StepAckRow,
  StoryRow,
  TaskRow,
  TroubleshootReportRow,
  WorkEntryRow,
} from './types'

export interface CreateProjectArgs {
  id: string
  code: string
  clientId: string
  name: string
  description: string | null
  currency: Currency
  salesPhaseId: string
  firstQuoteId: string
  now: number
}

export interface AppendIterationArgs {
  iterationId: string
  taskId: string
  n: number
  now: number
}

export interface CloseIterationArgs {
  iterationId: string
  now: number
  outcome: IterationOutcome
  closedByRole: Role
  notes: string | null
}

export interface ApproveQuoteArgs {
  quoteId: string
  kickoffPhaseId: string
  now: number
}

export interface RequestQuoteChangesArgs {
  oldQuoteId: string
  newQuoteId: string
  newVersion: number
  totalHoursMin: number
  totalCostCents: number
  now: number
}

export interface CreateTaskArgs {
  id: string
  code: string
  storyId: string
  type: TaskType
  ownerRole: Role
  assignee: string | null
  estimatedHoursMin: number
  initialIterationId: string
  now: number
}

export interface UpdateTaskStatusArgs {
  taskId: string
  status: TaskStatus
  currentIteration?: number
  now: number
}

export interface UpdateStoryStatusArgs {
  storyId: string
  status: StoryRow['status']
  now: number
}

export interface UpdatePhaseStatusArgs {
  phaseId: string
  status: PhaseRow['status']
  closedAt: number | null
  now: number
}

export interface LogWorkEntryArgs {
  id: string
  iterationId: string
  taskId: string
  personId: string
  role: Role
  minutes: number
  reworkTicketId: string | null
  notes: string | null
  loggedAt: number
  now: number
}

export interface CreateEvidenceArgs {
  id: string
  taskId: string
  iterationId: string
  type: EvidenceType
  kind: EvidenceKind
  path: string
  createdByRole: Role
  createdByAssignee: string | null
  notes: string | null
  now: number
}

export interface CreateGateArgs {
  id: string
  taskId: string
  iterationId: string
  gateType: GateType
  now: number
}

export interface RecordGateOutcomeArgs {
  gateId: string
  status: GateStatus
  outputPath: string | null
  now: number
}

export interface CreateKitTemplateArgs {
  id: string
  name: string
  description: string | null
  stack: string
  snapshotJson: string
  now: number
}

export interface PatchKitTemplateArgs {
  id: string
  patch: Partial<{
    name: string
    description: string | null
    stack: string
    snapshotJson: string
  }>
  now: number
}

export interface CreateExpenseArgs {
  id: string
  projectId: string
  category: ExpenseCategory
  vendor: string | null
  description: string
  amountCents: number
  incurredOn: string
  receiptPath: string | null
  now: number
}

export interface PatchExpenseArgs {
  id: string
  patch: Partial<{
    category: ExpenseCategory
    vendor: string | null
    description: string
    amountCents: number
    incurredOn: string
    receiptPath: string | null
  }>
  now: number
}

export interface CreateSecretArgs {
  id: string
  projectId: string
  name: string
  description: string | null
  valueCiphertext: string
  iv: string
  authTag: string
  now: number
}

export interface PatchSecretArgs {
  id: string
  patch: Partial<{
    description: string | null
    valueCiphertext: string
    iv: string
    authTag: string
  }>
  now: number
}

export interface CreateProjectMcpArgs {
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
  now: number
}

export interface CreateQuoteModuleArgs {
  id: string
  projectId: string
  name: string
  description: string | null
  defaultHoursJson: string
  defaultMarginBps: number
  sortOrder: number
  now: number
}

export interface PatchQuoteModuleArgs {
  id: string
  patch: Partial<{
    name: string
    description: string | null
    defaultHoursJson: string
    defaultMarginBps: number
    sortOrder: number
  }>
  now: number
}

export interface CreateQuoteItemArgs {
  id: string
  quoteId: string
  moduleId: string | null
  label: string
  description: string | null
  hoursMin: number
  rateCents: number
  marginBps: number
  sortOrder: number
  now: number
}

export interface PatchQuoteItemArgs {
  id: string
  patch: Partial<{
    label: string
    description: string | null
    hoursMin: number
    rateCents: number
    marginBps: number
    sortOrder: number
  }>
  now: number
}

export interface CreateQuoteMilestoneArgs {
  id: string
  quoteId: string
  label: string
  description: string | null
  percentageBps: number
  gateType: string | null
  sortOrder: number
  now: number
}

export interface PatchQuoteMilestoneArgs {
  id: string
  patch: Partial<{
    label: string
    description: string | null
    percentageBps: number
    gateType: string | null
    sortOrder: number
  }>
  now: number
}

export interface CreateInboxItemArgs {
  id: string
  kind: InboxKind
  title: string
  body: string | null
  projectId: string | null
  taskId: string | null
  runId: string | null
  now: number
}

export interface CreateProjectEnvArgs {
  id: string
  projectId: string
  environment: ProjectEnvironment
  name: string
  value: string
  description: string | null
  now: number
}

export interface PatchProjectEnvArgs {
  id: string
  patch: Partial<{
    value: string
    description: string | null
  }>
  now: number
}

export interface PatchProjectMcpArgs {
  id: string
  patch: Partial<{
    name: string
    description: string | null
    enabled: boolean
    command: string
    argsJson: string
    envJson: string
    url: string | null
    headersJson: string
    presetId: string | null
  }>
  now: number
}

export interface Storage {
  listClients(): Promise<ClientRow[]>
  getClientById(id: string): Promise<ClientRow | null>
  createClient(input: Omit<ClientRow, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<ClientRow>
  patchClient(
    id: string,
    patch: Partial<Pick<ClientRow, 'name' | 'taxId' | 'contactEmail' | 'driveFolderId'>>,
    now: number,
  ): Promise<ClientRow>
  softDeleteClient(id: string, now: number): Promise<void>
  /** List soft-deleted clients (deletedAt IS NOT NULL). Order: most recent first. */
  listTrashedClients(): Promise<ClientRow[]>
  /** Clear deletedAt on a soft-deleted client. No-op if it wasn't deleted. */
  restoreClient(id: string, now: number): Promise<ClientRow | null>
  countActiveProjectsForClient(clientId: string): Promise<number>

  listPeople(): Promise<PersonRow[]>
  getPersonById(id: string): Promise<PersonRow | null>
  createPerson(input: Omit<PersonRow, 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<PersonRow>
  patchPerson(
    id: string,
    patch: Partial<Pick<PersonRow, 'name' | 'email'>>,
    now: number,
  ): Promise<PersonRow>
  softDeletePerson(id: string, now: number): Promise<void>
  listTrashedPeople(): Promise<PersonRow[]>
  restorePerson(id: string, now: number): Promise<PersonRow | null>

  listProjectsWithClient(): Promise<Array<{ project: ProjectRow; client: ClientRow }>>
  getProjectById(id: string): Promise<ProjectRow | null>
  getProjectByCode(code: string): Promise<{ project: ProjectRow; client: ClientRow } | null>
  /**
   * Atomically inserts a Project, its F1_SALES Phase, and the first Quote
   * (draft v1) in a single transaction.
   */
  createProjectWithSalesPhase(args: CreateProjectArgs): Promise<ProjectRow>
  patchProject(
    id: string,
    patch: Partial<
      Pick<
        ProjectRow,
        'name' | 'description' | 'status' | 'workspacePath' | 'stack' | 'disabledSkillsJson'
      >
    >,
    now: number,
  ): Promise<ProjectRow>
  softDeleteProject(id: string, now: number): Promise<void>
  listTrashedProjects(): Promise<Array<{ project: ProjectRow; client: ClientRow }>>
  restoreProject(id: string, now: number): Promise<ProjectRow | null>

  getPhaseById(id: string): Promise<PhaseRow | null>
  getPhasesForProject(projectId: string): Promise<PhaseRow[]>
  getSalesPhase(projectId: string): Promise<PhaseRow | null>
  updatePhaseStatus(args: UpdatePhaseStatusArgs): Promise<PhaseRow>

  getQuoteById(id: string): Promise<QuoteRow | null>
  listQuotesForSalesPhase(phaseId: string): Promise<QuoteRow[]>
  getLatestQuoteForSalesPhase(phaseId: string): Promise<QuoteRow | null>
  patchQuote(
    id: string,
    patch: Partial<Pick<QuoteRow, 'totalHoursMin' | 'totalCostCents' | 'discountBps'>>,
    now: number,
  ): Promise<QuoteRow>
  updateQuoteStatus(id: string, status: QuoteRow['status'], now: number): Promise<QuoteRow>
  /**
   * Atomically: marks quote `approved`, closes F1_SALES phase, sets project
   * status to `active`, opens F2_KICKOFF phase.
   */
  approveQuoteAndOpenKickoff(args: ApproveQuoteArgs): Promise<QuoteRow>
  /**
   * Atomically: marks current quote `changes_requested` and inserts a new
   * draft Quote at version+1 with the previous totals.
   */
  requestQuoteChanges(args: RequestQuoteChangesArgs): Promise<QuoteRow>

  getStoryById(id: string): Promise<StoryRow | null>
  getStoryByCode(code: string): Promise<StoryRow | null>
  listStoriesForQuote(quoteId: string): Promise<StoryRow[]>
  createStory(input: Omit<StoryRow, 'createdAt' | 'updatedAt'> & { now: number }): Promise<StoryRow>
  patchStory(
    id: string,
    patch: Partial<
      Pick<
        StoryRow,
        | 'title'
        | 'goal'
        | 'acceptanceCriteriaJson'
        | 'inputsJson'
        | 'outputsJson'
        | 'verificationJson'
        | 'outOfScopeJson'
        | 'estimatedHoursMin'
        | 'priority'
        | 'ownerRole'
      >
    >,
    now: number,
  ): Promise<StoryRow>
  updateStoryStatus(args: UpdateStoryStatusArgs): Promise<StoryRow>

  getTaskById(id: string): Promise<TaskRow | null>
  getTaskByCode(code: string): Promise<TaskRow | null>
  listTasksForStory(storyId: string): Promise<TaskRow[]>
  /**
   * Atomically inserts a Task AND its initial Iteration (n=1).
   */
  createTaskWithFirstIteration(args: CreateTaskArgs): Promise<TaskRow>
  patchTask(
    id: string,
    patch: Partial<Pick<TaskRow, 'assignee' | 'estimatedHoursMin'>>,
    now: number,
  ): Promise<TaskRow>
  updateTaskStatus(args: UpdateTaskStatusArgs): Promise<TaskRow>
  /**
   * Atomically closes the current iteration AND advances the task's status
   * + iteration counter. Used by both approve and reject flows.
   */
  closeIterationAndAdvanceTask(args: {
    close: CloseIterationArgs
    taskUpdate: UpdateTaskStatusArgs
    nextIteration: AppendIterationArgs | null
  }): Promise<TaskRow>

  getIterationById(id: string): Promise<IterationRow | null>
  listIterationsForTask(taskId: string): Promise<IterationRow[]>
  getCurrentIteration(taskId: string): Promise<IterationRow | null>

  listWorkEntriesForTask(taskId: string): Promise<WorkEntryRow[]>
  listWorkEntriesForIteration(iterationId: string): Promise<WorkEntryRow[]>
  /**
   * Atomically inserts a WorkEntry AND adds its minutes to the task's
   * actualHoursMin counter.
   */
  logWorkEntry(args: LogWorkEntryArgs): Promise<WorkEntryRow>
  getTaskTotalMinutes(taskId: string): Promise<number>

  getGateById(id: string): Promise<GateRow | null>
  listGatesForIteration(iterationId: string): Promise<GateRow[]>
  countGateForIteration(iterationId: string, gateType: GateType): Promise<number>
  createGate(args: CreateGateArgs): Promise<GateRow>
  recordGateOutcome(args: RecordGateOutcomeArgs): Promise<GateRow>
  deleteGatesForIteration(args: { iterationId: string; types: GateType[] }): Promise<number>

  getEvidenceById(id: string): Promise<EvidenceRow | null>
  listEvidenceForIteration(iterationId: string): Promise<EvidenceRow[]>
  createEvidence(args: CreateEvidenceArgs): Promise<EvidenceRow>

  listDefaultRoleRates(): Promise<RoleRateRow[]>
  listProjectRoleRates(projectId: string): Promise<ProjectRoleRateRow[]>

  /**
   * Bulk pull of all work entries belonging to a project (any iteration of
   * any task of any story of any quote of the project). The cost report
   * needs this with the phase each iteration ran under.
   */
  listProjectWorkEntriesWithPhase(
    projectId: string,
  ): Promise<Array<{ entry: WorkEntryRow; phase: PhaseType }>>

  getAgentRunById(id: string): Promise<AgentRunRow | null>
  listAgentRunsForTask(taskId: string): Promise<AgentRunRow[]>
  listAgentRunsByStatus(status: AgentRunStatus): Promise<AgentRunRow[]>
  createAgentRun(args: CreateAgentRunArgs): Promise<AgentRunRow>
  updateAgentRunStarted(args: { id: string; now: number }): Promise<AgentRunRow>
  appendAgentRunOutput(args: { id: string; chunk: string; now: number }): Promise<void>
  /**
   * Atomically closes an AgentRun and (when status=succeeded) creates the
   * matching Evidence row plus a WorkEntry that adds the agent's minutes
   * to the task's actualHoursMin.
   */
  closeAgentRunSucceeded(args: CloseAgentRunSucceededArgs): Promise<AgentRunRow>
  /** Persists a failed/cancelled outcome without creating Evidence/WorkEntry. */
  closeAgentRunUnsuccessful(args: CloseAgentRunUnsuccessfulArgs): Promise<AgentRunRow>

  getDiscoveryConversationById(id: string): Promise<DiscoveryConversationRow | null>
  getActiveDiscoveryConversationForProject(
    projectId: string,
  ): Promise<DiscoveryConversationRow | null>
  createDiscoveryConversation(args: {
    id: string
    projectId: string
    provider: 'anthropic-sdk' | 'claude-cli'
    now: number
  }): Promise<DiscoveryConversationRow>
  setDiscoveryCliSessionId(args: {
    conversationId: string
    cliSessionId: string
    now: number
  }): Promise<DiscoveryConversationRow>
  listDiscoveryMessages(conversationId: string): Promise<DiscoveryMessageRow[]>
  appendDiscoveryMessage(args: {
    id: string
    conversationId: string
    role: 'user' | 'agent'
    content: string
    model: string | null
    tokensIn: number
    tokensOut: number
    costCents: number
    now: number
  }): Promise<DiscoveryMessageRow>
  attachDiscoveryStoriesDraft(args: {
    conversationId: string
    storiesDraftJson: string
    now: number
  }): Promise<DiscoveryConversationRow>
  approveDiscoveryConversation(args: {
    conversationId: string
    now: number
  }): Promise<DiscoveryConversationRow>
  /**
   * Move a discovery conversation from 'converged' back to 'active' so the
   * operator can keep refining the draft. The existing stories_draft_json
   * stays as a reference; a subsequent agent reply may overwrite it.
   */
  reopenDiscoveryConversation(args: {
    conversationId: string
    now: number
  }): Promise<DiscoveryConversationRow>

  // ── quote modules (parametric templates per project) ────────────────
  listQuoteModulesForProject(projectId: string): Promise<QuoteModuleRow[]>
  getQuoteModuleById(id: string): Promise<QuoteModuleRow | null>
  createQuoteModule(args: CreateQuoteModuleArgs): Promise<QuoteModuleRow>
  patchQuoteModule(args: PatchQuoteModuleArgs): Promise<QuoteModuleRow>
  softDeleteQuoteModule(id: string, now: number): Promise<void>

  // ── quote items (line items on a concrete quote) ────────────────────
  listQuoteItems(quoteId: string): Promise<QuoteItemRow[]>
  getQuoteItemById(id: string): Promise<QuoteItemRow | null>
  createQuoteItem(args: CreateQuoteItemArgs): Promise<QuoteItemRow>
  patchQuoteItem(args: PatchQuoteItemArgs): Promise<QuoteItemRow>
  deleteQuoteItem(id: string): Promise<void>
  /**
   * Recompute the quote's totalHoursMin + totalCostCents from its items.
   * Called after any item insert/update/delete. Idempotent.
   */
  recomputeQuoteTotals(quoteId: string, now: number): Promise<QuoteRow>

  listQuoteMilestones(quoteId: string): Promise<QuoteMilestoneRow[]>
  getQuoteMilestoneById(id: string): Promise<QuoteMilestoneRow | null>
  createQuoteMilestone(args: CreateQuoteMilestoneArgs): Promise<QuoteMilestoneRow>
  patchQuoteMilestone(args: PatchQuoteMilestoneArgs): Promise<QuoteMilestoneRow>
  deleteQuoteMilestone(id: string): Promise<void>

  listKitTemplates(): Promise<KitTemplateRow[]>
  getKitTemplateById(id: string): Promise<KitTemplateRow | null>
  createKitTemplate(args: CreateKitTemplateArgs): Promise<KitTemplateRow>
  patchKitTemplate(args: PatchKitTemplateArgs): Promise<KitTemplateRow>
  softDeleteKitTemplate(id: string, now: number): Promise<void>

  listExpensesForProject(projectId: string): Promise<ExpenseRow[]>
  getExpenseById(id: string): Promise<ExpenseRow | null>
  createExpense(args: CreateExpenseArgs): Promise<ExpenseRow>
  patchExpense(args: PatchExpenseArgs): Promise<ExpenseRow>
  softDeleteExpense(id: string, now: number): Promise<void>
  /** Sum of (non-soft-deleted) expenses in cents for one project. */
  sumExpensesForProject(projectId: string): Promise<number>

  listSecretsForProject(projectId: string): Promise<SecretRow[]>
  getSecretById(id: string): Promise<SecretRow | null>
  getSecretByName(projectId: string, name: string): Promise<SecretRow | null>
  createSecret(args: CreateSecretArgs): Promise<SecretRow>
  patchSecret(args: PatchSecretArgs): Promise<SecretRow>
  deleteSecret(id: string): Promise<void>

  listProjectMcps(projectId: string): Promise<ProjectMcpRow[]>
  getProjectMcpById(id: string): Promise<ProjectMcpRow | null>
  getProjectMcpByName(projectId: string, name: string): Promise<ProjectMcpRow | null>
  createProjectMcp(args: CreateProjectMcpArgs): Promise<ProjectMcpRow>
  patchProjectMcp(args: PatchProjectMcpArgs): Promise<ProjectMcpRow>
  softDeleteProjectMcp(id: string, now: number): Promise<void>

  listInboxItems(filters?: {
    unreadOnly?: boolean
    projectId?: string
  }): Promise<InboxItemRow[]>
  getInboxItemById(id: string): Promise<InboxItemRow | null>
  createInboxItem(args: CreateInboxItemArgs): Promise<InboxItemRow>
  markInboxItemRead(id: string, now: number): Promise<void>
  markAllInboxItemsRead(now: number, filters?: { projectId?: string }): Promise<void>
  deleteInboxItem(id: string): Promise<void>
  countUnreadInboxItems(filters?: { projectId?: string }): Promise<number>

  listProjectEnvs(projectId: string, environment?: ProjectEnvironment): Promise<ProjectEnvRow[]>
  getProjectEnvById(id: string): Promise<ProjectEnvRow | null>
  getProjectEnvByName(
    projectId: string,
    environment: ProjectEnvironment,
    name: string,
  ): Promise<ProjectEnvRow | null>
  createProjectEnv(args: CreateProjectEnvArgs): Promise<ProjectEnvRow>
  patchProjectEnv(args: PatchProjectEnvArgs): Promise<ProjectEnvRow>
  softDeleteProjectEnv(id: string, now: number): Promise<void>

  getTroubleshootReportById(id: string): Promise<TroubleshootReportRow | null>
  listTroubleshootReportsForTask(taskId: string): Promise<TroubleshootReportRow[]>
  listTroubleshootReportsByStatus(status: TroubleshootStatus): Promise<TroubleshootReportRow[]>
  createTroubleshootReport(args: CreateTroubleshootReportArgs): Promise<TroubleshootReportRow>
  patchTroubleshootReport(args: PatchTroubleshootReportArgs): Promise<TroubleshootReportRow>

  listStepAcksForTaskIteration(taskId: string, iterationN: number): Promise<StepAckRow[]>
  upsertStepAck(args: UpsertStepAckArgs): Promise<StepAckRow>
  deleteStepAck(args: { taskId: string; iterationN: number; stepId: string }): Promise<void>
}

export interface UpsertStepAckArgs {
  id: string
  taskId: string
  iterationN: number
  stepId: string
  ack: StepAckKind
  ackedByRole: Role
  notes: string | null
  now: number
}

export interface CreateAgentRunArgs {
  id: string
  taskId: string
  iterationId: string
  agentKind: AgentKind
  provider: AgentProvider
  model: string
  systemPrompt: string
  userPrompt: string
  now: number
}

export interface CloseAgentRunSucceededArgs {
  runId: string
  output: string
  tokensIn: number
  tokensOut: number
  costCents: number
  startedAt: number
  closedAt: number
  /** The bot Person to attribute the work entry to (system agent person). */
  botPersonId: string
  /** WorkEntry id to use. */
  workEntryId: string
  /** Evidence id to use. */
  evidenceId: string
  /** Where the transcript was written, relative to the workspace root. */
  evidencePath: string
}

export interface CloseAgentRunUnsuccessfulArgs {
  runId: string
  status: 'failed' | 'cancelled'
  errorMessage: string
  output: string
  tokensIn: number
  tokensOut: number
  costCents: number
  startedAt: number
  closedAt: number
}

export interface CreateTroubleshootReportArgs {
  id: string
  taskId: string
  parentReportId: string | null
  errorText: string
  contextNote: string | null
  beforeScreenshotPath: string | null
  now: number
}

export interface PatchTroubleshootReportArgs {
  id: string
  now: number
  status?: TroubleshootStatus
  afterScreenshotPath?: string | null
  lastDiagnosisRunId?: string | null
  diagnosisJson?: string | null
  requiredActionsJson?: string
  attemptCount?: number
  lastTestOutput?: string | null
  resolvedAt?: number | null
}
