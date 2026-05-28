// Schema-derived types and value-set exports.
// Consumers (apps/sidecar, apps/desktop, apps/web) import from here instead
// of touching the ORM directly.

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import type {
  agentRuns,
  assignments,
  clients,
  discoveryConversations,
  discoveryMessages,
  evidence,
  gates,
  iterations,
  people,
  phases,
  projectRoleRates,
  projects,
  quotes,
  reworkTickets,
  roles,
  stories,
  tasks,
  workEntries,
} from './schema'

export {
  agentKindValues,
  agentProviderValues,
  agentRuns,
  agentRunStatusValues,
  assignments,
  clients,
  currencyValues,
  evidence,
  evidenceKindValues,
  evidenceTypeValues,
  gates,
  gateStatusValues,
  gateTypeValues,
  iterationOutcomeValues,
  iterations,
  people,
  phases,
  phaseStatusValues,
  phaseTypeValues,
  projectRoleRates,
  projects,
  projectStatusValues,
  quotes,
  quoteStatusValues,
  reworkRootCauseValues,
  reworkTickets,
  roles,
  roleValues,
  stories,
  storyStatusValues,
  tasks,
  taskStatusValues,
  taskTypeValues,
  workEntries,
} from './schema'

export type {
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
  TaskStatus,
  TaskType,
} from './schema'

export type AgentRun = InferSelectModel<typeof agentRuns>
export type NewAgentRun = InferInsertModel<typeof agentRuns>

export type Assignment = InferSelectModel<typeof assignments>
export type NewAssignment = InferInsertModel<typeof assignments>

export type Client = InferSelectModel<typeof clients>
export type NewClient = InferInsertModel<typeof clients>

export type Evidence = InferSelectModel<typeof evidence>
export type NewEvidence = InferInsertModel<typeof evidence>

export type Gate = InferSelectModel<typeof gates>
export type NewGate = InferInsertModel<typeof gates>

export type Iteration = InferSelectModel<typeof iterations>
export type NewIteration = InferInsertModel<typeof iterations>

export type Person = InferSelectModel<typeof people>
export type NewPerson = InferInsertModel<typeof people>

export type Phase = InferSelectModel<typeof phases>
export type NewPhase = InferInsertModel<typeof phases>

export type Project = InferSelectModel<typeof projects>
export type NewProject = InferInsertModel<typeof projects>

export type ProjectRoleRate = InferSelectModel<typeof projectRoleRates>
export type NewProjectRoleRate = InferInsertModel<typeof projectRoleRates>

export type Quote = InferSelectModel<typeof quotes>
export type NewQuote = InferInsertModel<typeof quotes>

export type ReworkTicket = InferSelectModel<typeof reworkTickets>
export type NewReworkTicket = InferInsertModel<typeof reworkTickets>

export type RoleRow = InferSelectModel<typeof roles>
export type NewRoleRow = InferInsertModel<typeof roles>

export type Story = InferSelectModel<typeof stories>
export type NewStory = InferInsertModel<typeof stories>

export type Task = InferSelectModel<typeof tasks>
export type NewTask = InferInsertModel<typeof tasks>

export type WorkEntry = InferSelectModel<typeof workEntries>
export type NewWorkEntry = InferInsertModel<typeof workEntries>

export type DiscoveryConversation = InferSelectModel<typeof discoveryConversations>
export type NewDiscoveryConversation = InferInsertModel<typeof discoveryConversations>

export type DiscoveryMessage = InferSelectModel<typeof discoveryMessages>
export type NewDiscoveryMessage = InferInsertModel<typeof discoveryMessages>
