import type { AgentRunDTO, CreateAgentRunInput } from '@tortuga-os/contracts'
import type { AgentRunStatus } from '@tortuga-os/domain'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, state, ucOk } from '../errors'
import { agentRunDTO } from '../mappers'

// Default to Sonnet for all agent runs. Opus is more cautious and tends
// to stop and ask for confirmation even when --dangerously-skip-permissions
// is set, which deadlocks headless runs. Sonnet executes directly and is
// ~5x cheaper. Opus can still be requested explicitly via the input.
const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  'claude-cli': 'claude-sonnet-4-6',
  'anthropic-sdk': 'claude-sonnet-4-6',
  ollama: 'qwen2.5-coder:32b',
}

export async function listAgentRunsForTask(
  { storage }: CoreDeps,
  taskId: string,
): Promise<UseCaseResult<AgentRunDTO[]>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const rows = await storage.listAgentRunsForTask(taskId)
  return ucOk(rows.map(agentRunDTO))
}

export async function listAgentRunsByStatus(
  { storage }: CoreDeps,
  status: AgentRunStatus,
): Promise<UseCaseResult<AgentRunDTO[]>> {
  const rows = await storage.listAgentRunsByStatus(status)
  return ucOk(rows.map(agentRunDTO))
}

export async function getAgentRun(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<AgentRunDTO>> {
  const row = await storage.getAgentRunById(id)
  if (!row) return notFound('agent_run', id)
  return ucOk(agentRunDTO(row))
}

/**
 * Creates an AgentRun row in queued status. The sidecar's background
 * worker picks it up from there. The system + user prompts are
 * pre-assembled by the caller (sidecar combines the agent prompt with
 * task/story context).
 */
export interface QueueAgentRunInput extends CreateAgentRunInput {
  systemPrompt: string
  userPrompt: string
}

export async function queueAgentRun(
  { storage, newId, now }: CoreDeps,
  input: QueueAgentRunInput,
): Promise<UseCaseResult<AgentRunDTO>> {
  const task = await storage.getTaskById(input.taskId)
  if (!task) return notFound('task', input.taskId)
  const iter = await storage.getCurrentIteration(input.taskId)
  if (!iter) return notFound('current iteration of task', input.taskId)
  if (iter.closedAt !== null) {
    return state(`current iteration of task ${input.taskId} is closed`)
  }

  const row = await storage.createAgentRun({
    id: newId(),
    taskId: input.taskId,
    iterationId: iter.id,
    agentKind: input.agentKind,
    provider: input.provider,
    model: input.model ?? DEFAULT_MODEL_BY_PROVIDER[input.provider] ?? 'claude-opus-4-7',
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    now: now(),
  })
  return ucOk(agentRunDTO(row))
}

export interface QueueProjectAgentRunInput {
  projectId: string
  agentKind: CreateAgentRunInput['agentKind']
  provider: CreateAgentRunInput['provider']
  model?: string
  systemPrompt: string
  userPrompt: string
}

/**
 * Queue a PROJECT-scoped agent run (design / frame-assigner) that has no place
 * in the build backlog — it carries a projectId instead of a task + iteration.
 * The worker resolves the workspace from the project directly and the close
 * path skips work-entry/evidence creation.
 */
export async function queueProjectAgentRun(
  { storage, newId, now }: CoreDeps,
  input: QueueProjectAgentRunInput,
): Promise<UseCaseResult<AgentRunDTO>> {
  const project = await storage.getProjectById(input.projectId)
  if (!project) return notFound('project', input.projectId)

  const row = await storage.createAgentRun({
    id: newId(),
    projectId: input.projectId,
    agentKind: input.agentKind,
    provider: input.provider,
    model: input.model ?? DEFAULT_MODEL_BY_PROVIDER[input.provider] ?? 'claude-opus-4-7',
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    now: now(),
  })
  return ucOk(agentRunDTO(row))
}
