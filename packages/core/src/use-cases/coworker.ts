import type { TaskConversationWithMessagesDTO, TaskDTO } from '@tortuga-os/contracts'
import type { TaskCoworkerPhase, TaskExecutionMode } from '@tortuga-os/domain'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { taskConversationDTO, taskDTO, taskMessageDTO } from '../mappers'

/**
 * Coworker mode: a turn-based chat between the operator and the dev agent
 * that drives a single build task like Claude Code. Each user turn re-invokes
 * the dev agent (via the agent-run worker queue, so it edits files in the real
 * workspace) with the task brief + conversation history + a phase instruction.
 *
 * This module owns the conversation lifecycle (start/load, phase, execution
 * mode). The turn-running logic lives in the sidecar service because it needs
 * the worker queue + run polling, mirroring how the discovery CLI spawn lives
 * in the sidecar rather than core.
 */

export async function getOrStartConversation(
  deps: CoreDeps,
  taskId: string,
  provider: 'anthropic-sdk' | 'claude-cli' = 'claude-cli',
): Promise<UseCaseResult<TaskConversationWithMessagesDTO>> {
  const { storage, newId, now } = deps
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  let conv = await storage.getActiveTaskConversationForTask(taskId)
  if (!conv) {
    conv = await storage.createTaskConversation({
      id: newId(),
      taskId,
      provider,
      now: now(),
    })
  }
  const messages = await storage.listTaskMessages(conv.id)
  return ucOk({
    conversation: taskConversationDTO(conv),
    messages: messages.map(taskMessageDTO),
  })
}

export async function getConversationWithMessages(
  { storage }: CoreDeps,
  conversationId: string,
): Promise<UseCaseResult<TaskConversationWithMessagesDTO>> {
  const conv = await storage.getTaskConversationById(conversationId)
  if (!conv) return notFound('task_conversation', conversationId)
  const messages = await storage.listTaskMessages(conv.id)
  return ucOk({
    conversation: taskConversationDTO(conv),
    messages: messages.map(taskMessageDTO),
  })
}

export async function setExecutionMode(
  { storage, now }: CoreDeps,
  taskId: string,
  mode: TaskExecutionMode,
): Promise<UseCaseResult<TaskDTO>> {
  const task = await storage.getTaskById(taskId)
  if (!task) return notFound('task', taskId)
  const row = await storage.setTaskExecutionMode({ taskId, mode, now: now() })
  return ucOk(taskDTO(row))
}

export async function setPhase(
  { storage, now }: CoreDeps,
  conversationId: string,
  phase: TaskCoworkerPhase,
): Promise<UseCaseResult<TaskConversationWithMessagesDTO>> {
  const conv = await storage.getTaskConversationById(conversationId)
  if (!conv) return notFound('task_conversation', conversationId)
  await storage.setTaskConversationPhase({ id: conversationId, phase, now: now() })
  const updated = await storage.getTaskConversationById(conversationId)
  if (!updated) return notFound('task_conversation', conversationId)
  const messages = await storage.listTaskMessages(conversationId)
  return ucOk({
    conversation: taskConversationDTO(updated),
    messages: messages.map(taskMessageDTO),
  })
}
