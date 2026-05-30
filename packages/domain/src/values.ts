/**
 * Value sets for the consulting workflow domain.
 *
 * These are the canonical enums; everything else (SQLite schema in
 * storage-sqlite, zod schemas in contracts, frontend selectors) mirrors
 * what is declared here.
 *
 * This module is the conceptual root of the domain: every other piece of
 * code in this package depends on these values, and nothing here depends
 * on anything outside the package.
 */

export const ROLES = [
  'sales',
  'pm',
  'designer',
  'tech_lead',
  'dev',
  'qa',
  'devops',
  'client',
] as const
export type Role = (typeof ROLES)[number]

export const PROJECT_STATUSES = ['draft', 'active', 'paused', 'closed_won', 'closed_lost'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const CURRENCIES = ['USD', 'COP'] as const
export type Currency = (typeof CURRENCIES)[number]

export const PROJECT_STACKS = [
  'flutter-supabase',
  'flutter-local',
  'nextjs-supabase',
  'vite-react',
  'node-fastify',
  'unknown',
] as const
export type ProjectStack = (typeof PROJECT_STACKS)[number]

export const PHASE_TYPES = [
  'F1_SALES',
  'F2_KICKOFF',
  'F3_DESIGN',
  'F4_ARCHITECTURE',
  'F5_BUILD',
  'F6_QA_DEPLOY',
  'F7_HANDOFF',
] as const
export type PhaseType = (typeof PHASE_TYPES)[number]

export const PHASE_STATUSES = ['pending', 'in_progress', 'approved', 'rejected', 'rework'] as const
export type PhaseStatus = (typeof PHASE_STATUSES)[number]

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'changes_requested',
  'approved',
  'rejected',
] as const
export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

export const STORY_STATUSES = ['pending', 'in_progress', 'qa', 'approved', 'rejected'] as const
export type StoryStatus = (typeof STORY_STATUSES)[number]

export const TASK_TYPES = ['impl', 'design', 'arch', 'qa', 'deploy', 'docs', 'bugfix'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'qa',
  'approved',
  'rejected',
  'rework',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_EXECUTION_MODES = ['coworker', 'manual'] as const
export type TaskExecutionMode = (typeof TASK_EXECUTION_MODES)[number]

export const TASK_COWORKER_PHASES = [
  'planning',
  'construction',
  'execution',
  'validation',
  'delivery',
] as const
export type TaskCoworkerPhase = (typeof TASK_COWORKER_PHASES)[number]

export const TASK_CONVERSATION_STATUSES = ['active', 'archived'] as const
export type TaskConversationStatus = (typeof TASK_CONVERSATION_STATUSES)[number]

export const ITERATION_OUTCOMES = ['approved', 'rejected', 'rework_requested', 'reopened'] as const
export type IterationOutcome = (typeof ITERATION_OUTCOMES)[number]

export const REWORK_ROOT_CAUSES = [
  'F1_SALES',
  'F2_KICKOFF',
  'F3_DESIGN',
  'F4_ARCHITECTURE',
  'F5_BUILD',
  'F6_QA_DEPLOY',
  'client_initiated',
] as const
export type ReworkRootCause = (typeof REWORK_ROOT_CAUSES)[number]

export const EVIDENCE_TYPES = ['sales', 'design', 'arch', 'dev', 'qa', 'prod'] as const
export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export const EVIDENCE_KINDS = [
  'video',
  'image',
  'pdf',
  'swagger',
  'curl_log',
  'screencap',
  'gate_output',
  'signed_doc',
] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const GATE_TYPES = [
  'G1_ANALYZE',
  'G2_ARCH',
  'G3_BUILD',
  'G4_BOOT',
  'G5_FIDELITY',
  'G6_REAL_WORK',
  'G7_A11Y',
] as const
export type GateType = (typeof GATE_TYPES)[number]

export const GATE_STATUSES = ['pending', 'passed', 'failed', 'skipped'] as const
export type GateStatus = (typeof GATE_STATUSES)[number]

export const AGENT_KINDS = [
  'dev',
  // Stack-specialized dev agents. Driven by project.stack; each one has
  // its own systemPrompt with the conventions of that stack baked in.
  'dev-flutter',
  'dev-nextjs',
  'dev-vite-react',
  'dev-node',
  'designer',
  // Distributes the project's imported/generated Figma frames to their
  // matching build stories (post-design hook, before build).
  'frame-assigner',
  'qa',
  'tech_lead',
  'arch',
  'sales',
  'pm',
  // Runtime error troubleshooter: triggered from observed app errors
  // (paste / hook / logcat), produces structured diagnosis JSON.
  'troubleshooter',
  // Scaffold repair agent: triggered when the deterministic scaffold
  // pipeline fails N times. Reads the failing step logs + the pubspec
  // and adjusts deps / templates until `flutter analyze` + `flutter
  // test` pass.
  'scaffold-fixer',
  // Gate repair agent: triggered when a verification gate fails on any
  // task. Reads the gate log + workspace, applies the fix (missing
  // golden baseline, broken test, build config, etc), and re-runs the
  // gate until it passes.
  'gate-fixer',
] as const
export type AgentKind = (typeof AGENT_KINDS)[number]

export const AGENT_PROVIDERS = ['claude-cli', 'anthropic-sdk', 'ollama'] as const
export type AgentProvider = (typeof AGENT_PROVIDERS)[number]

export const AGENT_RUN_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number]

export const TROUBLESHOOT_STATUSES = [
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
export type TroubleshootStatus = (typeof TROUBLESHOOT_STATUSES)[number]

export const DISCOVERY_STATUSES = ['active', 'converged', 'archived'] as const
export type DiscoveryStatus = (typeof DISCOVERY_STATUSES)[number]

export const DISCOVERY_MESSAGE_ROLES = ['user', 'agent'] as const
export type DiscoveryMessageRole = (typeof DISCOVERY_MESSAGE_ROLES)[number]

export const DISCOVERY_PROVIDERS = ['anthropic-sdk', 'claude-cli'] as const
export type DiscoveryProvider = (typeof DISCOVERY_PROVIDERS)[number]

export const INBOX_KINDS = [
  'agent_run_failed',
  'agent_run_succeeded',
  'gate_failed',
  'task_blocked',
  'release_built',
  'troubleshoot_escalated',
  'troubleshoot_verified',
  'info',
] as const
export type InboxKind = (typeof INBOX_KINDS)[number]

export const PROJECT_ENVIRONMENTS = ['dev', 'staging', 'prod'] as const
export type ProjectEnvironment = (typeof PROJECT_ENVIRONMENTS)[number]

/**
 * Lifecycle of a design frame in F3. `imported` = pulled from an existing
 * Figma file; `generated` = created from intent by the designer agent;
 * `approved` = the client signed off on this frame (F3 exit gate per-frame).
 */
export const DESIGN_FRAME_STATUSES = ['imported', 'generated', 'approved'] as const
export type DesignFrameStatus = (typeof DESIGN_FRAME_STATUSES)[number]

/** Maps a Phase to the role accountable for closing it. PHASES.md §1-§7. */
export const PHASE_OWNER_ROLE: Record<PhaseType, Role> = {
  F1_SALES: 'sales',
  F2_KICKOFF: 'pm',
  F3_DESIGN: 'designer',
  F4_ARCHITECTURE: 'tech_lead',
  F5_BUILD: 'dev',
  F6_QA_DEPLOY: 'qa',
  F7_HANDOFF: 'pm',
}

/**
 * Gate matrix: which gates apply to which task type. PHASES-WORKFLOW.md
 * "Gate matrix". `null` means the gate does not apply to that task type.
 */
export const GATE_MATRIX: Record<TaskType, ReadonlyArray<GateType>> = {
  impl: ['G1_ANALYZE', 'G2_ARCH', 'G3_BUILD', 'G4_BOOT', 'G5_FIDELITY', 'G6_REAL_WORK', 'G7_A11Y'],
  design: ['G6_REAL_WORK'],
  arch: ['G6_REAL_WORK'],
  qa: ['G6_REAL_WORK'],
  deploy: ['G3_BUILD', 'G4_BOOT', 'G6_REAL_WORK'],
  docs: ['G6_REAL_WORK'],
  // Bugfix tasks reuse the same gates as impl: the fix is code that must
  // compile (G1/G3), boot (G4), and pass the integration test the
  // troubleshooter writes (G5/G6). A11y can be skipped as the fix is
  // usually scoped to a single bug, not a UI surface.
  bugfix: ['G1_ANALYZE', 'G3_BUILD', 'G4_BOOT', 'G5_FIDELITY', 'G6_REAL_WORK'],
}
