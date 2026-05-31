// Single source of truth for value sets is @tortuga-os/domain.
// This module re-exports them so frontends and the sidecar can import
// from @tortuga-os/contracts without depending on domain transitively.

export {
  AGENT_KINDS,
  AGENT_PROVIDERS,
  AGENT_RUN_STATUSES,
  CURRENCIES,
  DESIGN_FRAME_STATUSES,
  DISCOVERY_MESSAGE_ROLES,
  DISCOVERY_PROVIDERS,
  DISCOVERY_STATUSES,
  EVIDENCE_KINDS,
  EVIDENCE_TYPES,
  GATE_STATUSES,
  GATE_TYPES,
  INBOX_KINDS,
  ITERATION_OUTCOMES,
  PHASE_OWNER_ROLE,
  PHASE_STATUSES,
  PHASE_TYPES,
  PROJECT_ENVIRONMENTS,
  PROJECT_STACKS,
  PROJECT_STATUSES,
  // Note: types InboxKind and ProjectEnvironment are intentionally not
  // re-exported here — the canonical type lives in schemas/inbox.ts and
  // schemas/project-envs.ts (zod) like ExpenseCategory. dtos.ts imports
  // them from those modules.
  QUOTE_STATUSES,
  REWORK_ROOT_CAUSES,
  ROLES,
  STORY_STATUSES,
  TASK_CONVERSATION_STATUSES,
  TASK_COWORKER_PHASES,
  TASK_EXECUTION_MODES,
  TASK_STATUSES,
  TASK_TYPES,
  TROUBLESHOOT_STATUSES,
} from '@tortuga-os/domain'

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
  TaskConversationStatus,
  TaskCoworkerPhase,
  TaskExecutionMode,
  TaskStatus,
  TaskType,
  TroubleshootStatus,
} from '@tortuga-os/domain'
