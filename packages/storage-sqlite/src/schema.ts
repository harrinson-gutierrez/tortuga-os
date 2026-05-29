import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

/**
 * Tortuga OS — Domain schema (consulting workflow orchestrator).
 *
 * Single source of truth: docs/DOMAIN.md.
 *
 * Conventions:
 *   - IDs: UUID v7 generated in application code (string).
 *   - Timestamps: epoch ms (integer).
 *   - Money: integer in CENTS to avoid floats (USD 100.00 = 10000).
 *   - Hours: integer in MINUTES (1 hour = 60).
 *   - Soft-delete via deletedAt where it matters.
 *   - JSON columns end with `Json`; the value is a string-encoded JSON.
 */

const tsCols = {
  createdAt: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
}

export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  contactEmail: text('contact_email'),
  driveFolderId: text('drive_folder_id'),
  ...tsCols,
  deletedAt: integer('deleted_at'),
})

export const roleValues = [
  'sales',
  'pm',
  'designer',
  'tech_lead',
  'dev',
  'qa',
  'devops',
  'client',
] as const
export type Role = (typeof roleValues)[number]

export const roles = sqliteTable('roles', {
  id: text('id', { enum: roleValues }).primaryKey(),
  defaultHourlyRateCents: integer('default_hourly_rate_cents').notNull().default(0),
  ...tsCols,
})

export const projectStatusValues = [
  'draft',
  'active',
  'paused',
  'closed_won',
  'closed_lost',
] as const
export type ProjectStatus = (typeof projectStatusValues)[number]

export const currencyValues = ['USD', 'COP'] as const
export type Currency = (typeof currencyValues)[number]

export const projectStackValues = [
  'flutter-supabase',
  'flutter-local',
  'nextjs-supabase',
  'vite-react',
  'node-fastify',
  'unknown',
] as const
export type ProjectStack = (typeof projectStackValues)[number]

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  clientId: text('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status', { enum: projectStatusValues }).notNull().default('draft'),
  currency: text('currency', { enum: currencyValues }).notNull().default('COP'),
  stack: text('stack', { enum: projectStackValues }).notNull().default('unknown'),
  workspacePath: text('workspace_path'),
  startedAt: integer('started_at'),
  closedAt: integer('closed_at'),
  disabledSkillsJson: text('disabled_skills_json').notNull().default('[]'),
  ...tsCols,
  deletedAt: integer('deleted_at'),
})

export const projectRoleRates = sqliteTable(
  'project_role_rates',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: text('role', { enum: roleValues }).notNull(),
    hourlyRateCents: integer('hourly_rate_cents').notNull(),
    ...tsCols,
  },
  (t) => ({
    uniqueProjectRole: unique('project_role_rates_project_role_uq').on(t.projectId, t.role),
  }),
)

export const phaseTypeValues = [
  'F1_SALES',
  'F2_KICKOFF',
  'F3_DESIGN',
  'F4_ARCHITECTURE',
  'F5_BUILD',
  'F6_QA_DEPLOY',
  'F7_HANDOFF',
] as const
export type PhaseType = (typeof phaseTypeValues)[number]

export const phaseStatusValues = [
  'pending',
  'in_progress',
  'approved',
  'rejected',
  'rework',
] as const
export type PhaseStatus = (typeof phaseStatusValues)[number]

export const phases = sqliteTable(
  'phases',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type', { enum: phaseTypeValues }).notNull(),
    status: text('status', { enum: phaseStatusValues }).notNull().default('pending'),
    iteration: integer('iteration').notNull().default(1),
    ownerRole: text('owner_role', { enum: roleValues }).notNull(),
    artifactPath: text('artifact_path'),
    startedAt: integer('started_at'),
    closedAt: integer('closed_at'),
    ...tsCols,
  },
  (t) => ({
    uniqueProjectType: unique('phases_project_type_uq').on(t.projectId, t.type),
  }),
)

export const quoteStatusValues = [
  'draft',
  'sent',
  'changes_requested',
  'approved',
  'rejected',
] as const
export type QuoteStatus = (typeof quoteStatusValues)[number]

export const quotes = sqliteTable(
  'quotes',
  {
    id: text('id').primaryKey(),
    phaseId: text('phase_id')
      .notNull()
      .references(() => phases.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    status: text('status', { enum: quoteStatusValues }).notNull().default('draft'),
    totalHoursMin: integer('total_hours_min').notNull().default(0),
    totalCostCents: integer('total_cost_cents').notNull().default(0),
    discountBps: integer('discount_bps').notNull().default(0),
    approvedAt: integer('approved_at'),
    ...tsCols,
  },
  (t) => ({
    uniquePhaseVersion: unique('quotes_phase_version_uq').on(t.phaseId, t.version),
  }),
)

export const storyStatusValues = ['pending', 'in_progress', 'qa', 'approved', 'rejected'] as const
export type StoryStatus = (typeof storyStatusValues)[number]

export const stories = sqliteTable('stories', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  goal: text('goal').notNull(),
  acceptanceCriteriaJson: text('acceptance_criteria_json').notNull().default('[]'),
  inputsJson: text('inputs_json').notNull().default('{}'),
  outputsJson: text('outputs_json').notNull().default('{}'),
  verificationJson: text('verification_json').notNull().default('{}'),
  outOfScopeJson: text('out_of_scope_json').notNull().default('[]'),
  estimatedHoursMin: integer('estimated_hours_min').notNull().default(0),
  actualHoursMin: integer('actual_hours_min').notNull().default(0),
  status: text('status', { enum: storyStatusValues }).notNull().default('pending'),
  priority: integer('priority').notNull().default(3),
  ownerRole: text('owner_role', { enum: roleValues }).notNull(),
  ...tsCols,
})

export const taskTypeValues = ['impl', 'design', 'arch', 'qa', 'deploy', 'docs', 'bugfix'] as const
export type TaskType = (typeof taskTypeValues)[number]

export const taskStatusValues = [
  'pending',
  'in_progress',
  'qa',
  'approved',
  'rejected',
  'rework',
] as const
export type TaskStatus = (typeof taskStatusValues)[number]

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  storyId: text('story_id')
    .notNull()
    .references(() => stories.id, { onDelete: 'cascade' }),
  type: text('type', { enum: taskTypeValues }).notNull(),
  ownerRole: text('owner_role', { enum: roleValues }).notNull(),
  assignee: text('assignee'),
  status: text('status', { enum: taskStatusValues }).notNull().default('pending'),
  currentIteration: integer('current_iteration').notNull().default(1),
  estimatedHoursMin: integer('estimated_hours_min').notNull().default(0),
  actualHoursMin: integer('actual_hours_min').notNull().default(0),
  ...tsCols,
})

export const iterationOutcomeValues = [
  'approved',
  'rejected',
  'rework_requested',
  'reopened',
] as const
export type IterationOutcome = (typeof iterationOutcomeValues)[number]

export const iterations = sqliteTable(
  'iterations',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    n: integer('n').notNull(),
    startedAt: integer('started_at').notNull().default(sql`(unixepoch() * 1000)`),
    closedAt: integer('closed_at'),
    outcome: text('outcome', { enum: iterationOutcomeValues }),
    closedByRole: text('closed_by_role', { enum: roleValues }),
    notes: text('notes'),
    ...tsCols,
  },
  (t) => ({
    uniqueTaskN: unique('iterations_task_n_uq').on(t.taskId, t.n),
  }),
)

export const reworkRootCauseValues = [
  'F1_SALES',
  'F2_KICKOFF',
  'F3_DESIGN',
  'F4_ARCHITECTURE',
  'F5_BUILD',
  'F6_QA_DEPLOY',
  'client_initiated',
] as const
export type ReworkRootCause = (typeof reworkRootCauseValues)[number]

export const reworkTickets = sqliteTable('rework_tickets', {
  id: text('id').primaryKey(),
  iterationId: text('iteration_id')
    .notNull()
    .references(() => iterations.id, { onDelete: 'cascade' }),
  triggeredByPhase: text('triggered_by_phase', { enum: phaseTypeValues }).notNull(),
  rootCausePhase: text('root_cause_phase', { enum: reworkRootCauseValues }).notNull(),
  rootCauseRole: text('root_cause_role', { enum: roleValues }).notNull(),
  weight: integer('weight_basis_points').notNull().default(10000),
  description: text('description').notNull(),
  artifactRef: text('artifact_ref'),
  hoursSpentMin: integer('hours_spent_min').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  ...tsCols,
})

export const evidenceTypeValues = ['sales', 'design', 'arch', 'dev', 'qa', 'prod'] as const
export type EvidenceType = (typeof evidenceTypeValues)[number]

export const evidenceKindValues = [
  'video',
  'image',
  'pdf',
  'swagger',
  'curl_log',
  'screencap',
  'gate_output',
  'signed_doc',
] as const
export type EvidenceKind = (typeof evidenceKindValues)[number]

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  iterationId: text('iteration_id')
    .notNull()
    .references(() => iterations.id, { onDelete: 'cascade' }),
  type: text('type', { enum: evidenceTypeValues }).notNull(),
  kind: text('kind', { enum: evidenceKindValues }).notNull(),
  path: text('path').notNull(),
  createdByRole: text('created_by_role', { enum: roleValues }).notNull(),
  createdByAssignee: text('created_by_assignee'),
  notes: text('notes'),
  ...tsCols,
})

export const gateTypeValues = [
  'G1_ANALYZE',
  'G2_ARCH',
  'G3_BUILD',
  'G4_BOOT',
  'G5_FIDELITY',
  'G6_REAL_WORK',
  'G7_A11Y',
] as const
export type GateType = (typeof gateTypeValues)[number]

export const gateStatusValues = ['pending', 'passed', 'failed', 'skipped'] as const
export type GateStatus = (typeof gateStatusValues)[number]

export const gates = sqliteTable(
  'gates',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    iterationId: text('iteration_id')
      .notNull()
      .references(() => iterations.id, { onDelete: 'cascade' }),
    gateType: text('gate_type', { enum: gateTypeValues }).notNull(),
    status: text('status', { enum: gateStatusValues }).notNull().default('pending'),
    outputPath: text('output_path'),
    ranAt: integer('ran_at'),
    ...tsCols,
  },
  (t) => ({
    uniqueIterationGate: unique('gates_iteration_gate_uq').on(t.iterationId, t.gateType),
  }),
)

export const people = sqliteTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email'),
  ...tsCols,
  deletedAt: integer('deleted_at'),
})

export const assignments = sqliteTable(
  'assignments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    personId: text('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'restrict' }),
    role: text('role', { enum: roleValues }).notNull(),
    ...tsCols,
  },
  (t) => ({
    uniqueTaskPersonRole: unique('assignments_task_person_role_uq').on(
      t.taskId,
      t.personId,
      t.role,
    ),
  }),
)

export const workEntries = sqliteTable('work_entries', {
  id: text('id').primaryKey(),
  iterationId: text('iteration_id')
    .notNull()
    .references(() => iterations.id, { onDelete: 'cascade' }),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  personId: text('person_id')
    .notNull()
    .references(() => people.id, { onDelete: 'restrict' }),
  role: text('role', { enum: roleValues }).notNull(),
  minutes: integer('minutes').notNull(),
  reworkTicketId: text('rework_ticket_id').references(() => reworkTickets.id, {
    onDelete: 'set null',
  }),
  notes: text('notes'),
  loggedAt: integer('logged_at').notNull().default(sql`(unixepoch() * 1000)`),
  ...tsCols,
})

export const agentKindValues = [
  'dev',
  'dev-flutter',
  'dev-nextjs',
  'dev-vite-react',
  'dev-node',
  'designer',
  'qa',
  'tech_lead',
  'arch',
  'sales',
  'pm',
  'troubleshooter',
  'scaffold-fixer',
  'gate-fixer',
] as const
export type AgentKind = (typeof agentKindValues)[number]

export const agentProviderValues = ['claude-cli', 'anthropic-sdk', 'ollama'] as const
export type AgentProvider = (typeof agentProviderValues)[number]

export const agentRunStatusValues = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const
export type AgentRunStatus = (typeof agentRunStatusValues)[number]

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  iterationId: text('iteration_id')
    .notNull()
    .references(() => iterations.id, { onDelete: 'cascade' }),
  agentKind: text('agent_kind', { enum: agentKindValues }).notNull(),
  provider: text('provider', { enum: agentProviderValues }).notNull(),
  model: text('model').notNull(),
  status: text('status', { enum: agentRunStatusValues }).notNull().default('queued'),
  systemPrompt: text('system_prompt').notNull(),
  userPrompt: text('user_prompt').notNull(),
  output: text('output'),
  errorMessage: text('error_message'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  startedAt: integer('started_at'),
  closedAt: integer('closed_at'),
  workEntryId: text('work_entry_id').references(() => workEntries.id, { onDelete: 'set null' }),
  evidenceId: text('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
  ...tsCols,
})

export const discoveryStatusValues = ['active', 'converged', 'archived'] as const
export type DiscoveryStatus = (typeof discoveryStatusValues)[number]

export const discoveryProviderValues = ['anthropic-sdk', 'claude-cli'] as const
export type DiscoveryProvider = (typeof discoveryProviderValues)[number]

export const discoveryConversations = sqliteTable('discovery_conversations', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  status: text('status', { enum: discoveryStatusValues }).notNull().default('active'),
  provider: text('provider', { enum: discoveryProviderValues }).notNull().default('claude-cli'),
  cliSessionId: text('cli_session_id'),
  storiesDraftJson: text('stories_draft_json'),
  approvedAt: integer('approved_at'),
  ...tsCols,
})

export const discoveryMessageRoleValues = ['user', 'agent'] as const
export type DiscoveryMessageRole = (typeof discoveryMessageRoleValues)[number]

export const discoveryMessages = sqliteTable('discovery_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => discoveryConversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: discoveryMessageRoleValues }).notNull(),
  content: text('content').notNull(),
  model: text('model'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0),
  ...tsCols,
})

export const quoteModules = sqliteTable('quote_modules', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  defaultHoursJson: text('default_hours_json').notNull().default('{}'),
  defaultMarginBps: integer('default_margin_bps').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  ...tsCols,
  deletedAt: integer('deleted_at'),
})

export const quoteItems = sqliteTable('quote_items', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  moduleId: text('module_id').references(() => quoteModules.id, {
    onDelete: 'set null',
  }),
  label: text('label').notNull(),
  description: text('description'),
  hoursMin: integer('hours_min').notNull().default(0),
  rateCents: integer('rate_cents').notNull().default(0),
  marginBps: integer('margin_bps').notNull().default(0),
  subtotalCents: integer('subtotal_cents').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  ...tsCols,
})

export const quoteMilestones = sqliteTable('quote_milestones', {
  id: text('id').primaryKey(),
  quoteId: text('quote_id')
    .notNull()
    .references(() => quotes.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  description: text('description'),
  percentageBps: integer('percentage_bps').notNull().default(0),
  gateType: text('gate_type'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...tsCols,
})

export const kitTemplates = sqliteTable('kit_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  stack: text('stack').notNull().default('unknown'),
  snapshotJson: text('snapshot_json').notNull().default('{}'),
  ...tsCols,
  deletedAt: integer('deleted_at'),
})

export const designFrameStatusValues = ['imported', 'generated', 'approved'] as const
export type DesignFrameStatus = (typeof designFrameStatusValues)[number]

export const designFrames = sqliteTable(
  'design_frames',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    figmaFileKey: text('figma_file_key').notNull(),
    figmaNodeId: text('figma_node_id').notNull(),
    name: text('name').notNull(),
    tokensJson: text('tokens_json').notNull().default('{}'),
    baselineScreenshotPath: text('baseline_screenshot_path'),
    status: text('status', { enum: designFrameStatusValues }).notNull().default('imported'),
    fidelityPct: integer('fidelity_pct'),
    ...tsCols,
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    uniqueStoryNode: unique('design_frames_story_node_uq').on(t.storyId, t.figmaNodeId),
    byStory: index('design_frames_story_idx').on(t.storyId),
  }),
)

export const expenseCategoryValues = [
  'contractor',
  'saas',
  'hosting',
  'license',
  'hardware',
  'travel',
  'other',
] as const
export type ExpenseCategory = (typeof expenseCategoryValues)[number]

export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  category: text('category', { enum: expenseCategoryValues }).notNull(),
  vendor: text('vendor'),
  description: text('description').notNull(),
  amountCents: integer('amount_cents').notNull(),
  incurredOn: text('incurred_on').notNull(),
  receiptPath: text('receipt_path'),
  ...tsCols,
  deletedAt: integer('deleted_at'),
})

export const secrets = sqliteTable(
  'secrets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    valueCiphertext: text('value_ciphertext').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    ...tsCols,
  },
  (t) => ({
    uniqueProjectName: unique('secrets_project_name_uq').on(t.projectId, t.name),
  }),
)

export const mcpTransportValues = ['stdio', 'http'] as const
export type McpTransport = (typeof mcpTransportValues)[number]

export const projectMcps = sqliteTable(
  'project_mcps',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    transport: text('transport', { enum: mcpTransportValues }).notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    command: text('command').notNull().default(''),
    argsJson: text('args_json').notNull().default('[]'),
    envJson: text('env_json').notNull().default('{}'),
    url: text('url'),
    headersJson: text('headers_json').notNull().default('{}'),
    presetId: text('preset_id'),
    ...tsCols,
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    byProject: index('project_mcps_project_idx').on(t.projectId),
    uniqueProjectName: unique('project_mcps_project_name_uq').on(t.projectId, t.name),
  }),
)

export const inboxKindValues = [
  'agent_run_failed',
  'agent_run_succeeded',
  'gate_failed',
  'task_blocked',
  'release_built',
  'troubleshoot_escalated',
  'troubleshoot_verified',
  'info',
] as const
export type InboxKind = (typeof inboxKindValues)[number]

export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: inboxKindValues }).notNull(),
    title: text('title').notNull(),
    body: text('body'),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    taskId: text('task_id'),
    runId: text('run_id'),
    readAt: integer('read_at'),
    ...tsCols,
  },
  (t) => ({
    byCreatedAt: index('inbox_items_created_at_idx').on(t.createdAt),
    byProject: index('inbox_items_project_idx').on(t.projectId),
  }),
)

export const projectEnvironmentValues = ['dev', 'staging', 'prod'] as const
export type ProjectEnvironment = (typeof projectEnvironmentValues)[number]

export const projectEnvs = sqliteTable(
  'project_envs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    environment: text('environment', { enum: projectEnvironmentValues }).notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    ...tsCols,
    deletedAt: integer('deleted_at'),
  },
  (t) => ({
    uniqueProjectEnvName: unique('project_envs_project_env_name_uq').on(
      t.projectId,
      t.environment,
      t.name,
    ),
  }),
)

export const troubleshootStatusValues = [
  'open',
  'diagnosing',
  'proposed',
  'applying',
  'testing',
  'awaiting-operator',
  'verified',
  'resolved',
  'dismissed',
  'escalated',
] as const
export type TroubleshootStatus = (typeof troubleshootStatusValues)[number]

export const troubleshootReports = sqliteTable(
  'troubleshoot_reports',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    parentReportId: text('parent_report_id'),
    status: text('status', { enum: troubleshootStatusValues }).notNull().default('open'),
    errorText: text('error_text').notNull(),
    contextNote: text('context_note'),
    beforeScreenshotPath: text('before_screenshot_path'),
    afterScreenshotPath: text('after_screenshot_path'),
    lastDiagnosisRunId: text('last_diagnosis_run_id').references(() => agentRuns.id, {
      onDelete: 'set null',
    }),
    diagnosisJson: text('diagnosis_json'),
    requiredActionsJson: text('required_actions_json').notNull().default('[]'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastTestOutput: text('last_test_output'),
    resolvedAt: integer('resolved_at'),
    ...tsCols,
  },
  (t) => ({
    byTask: index('troubleshoot_reports_task_idx').on(t.taskId),
    byStatus: index('troubleshoot_reports_status_idx').on(t.status),
  }),
)

export const stepAckValues = ['ok', 'fail'] as const
export type StepAck = (typeof stepAckValues)[number]

export const stepAcks = sqliteTable(
  'step_acks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    iterationN: integer('iteration_n').notNull(),
    stepId: text('step_id').notNull(),
    ack: text('ack', { enum: stepAckValues }).notNull(),
    ackedByRole: text('acked_by_role', { enum: roleValues }).notNull(),
    notes: text('notes'),
    ackedAt: integer('acked_at').notNull(),
    ...tsCols,
  },
  (t) => ({
    uniqueAck: unique('step_acks_task_iter_step_uq').on(t.taskId, t.iterationN, t.stepId),
    byTaskIter: index('step_acks_task_iter_idx').on(t.taskId, t.iterationN),
  }),
)
