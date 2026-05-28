import type {
  DiscoveryConversationDTO,
  DiscoveryConversationWithMessagesDTO,
  DiscoveryMessageDTO,
  DiscoveryStoryDraftDTO,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, state, ucOk } from '../errors'
import { discoveryConversationDTO, discoveryMessageDTO } from '../mappers'

/**
 * Discovery flow: a chat between the operator and the `sales` agent that
 * iterates until they converge on a list of stories worth quoting. When
 * the agent emits a structured proposal, it is parked on the conversation
 * (`storiesDraftJson`). The operator can then approve it, which archives
 * the conversation and feeds the materialization step that creates real
 * Story + Task rows on the project.
 */

export async function getOrStartConversation(
  deps: CoreDeps,
  projectCode: string,
  provider: 'anthropic-sdk' | 'claude-cli' = 'claude-cli',
): Promise<UseCaseResult<DiscoveryConversationWithMessagesDTO>> {
  const { storage, newId, now } = deps
  const found = await storage.getProjectByCode(projectCode)
  if (!found) return notFound('project', projectCode)
  let conv = await storage.getActiveDiscoveryConversationForProject(found.project.id)
  if (!conv) {
    conv = await storage.createDiscoveryConversation({
      id: newId(),
      projectId: found.project.id,
      provider,
      now: now(),
    })
  }
  const messages = await storage.listDiscoveryMessages(conv.id)
  return ucOk({
    conversation: discoveryConversationDTO(conv),
    messages: messages.map(discoveryMessageDTO),
  })
}

export async function getConversationWithMessages(
  { storage }: CoreDeps,
  conversationId: string,
): Promise<UseCaseResult<DiscoveryConversationWithMessagesDTO>> {
  const conv = await storage.getDiscoveryConversationById(conversationId)
  if (!conv) return notFound('discovery_conversation', conversationId)
  const messages = await storage.listDiscoveryMessages(conv.id)
  return ucOk({
    conversation: discoveryConversationDTO(conv),
    messages: messages.map(discoveryMessageDTO),
  })
}

export async function appendUserMessage(
  deps: CoreDeps,
  conversationId: string,
  content: string,
): Promise<UseCaseResult<DiscoveryMessageDTO>> {
  const { storage, newId, now } = deps
  const conv = await storage.getDiscoveryConversationById(conversationId)
  if (!conv) return notFound('discovery_conversation', conversationId)
  if (conv.status === 'archived') {
    return state(`conversation ${conversationId} is archived, start a new one`)
  }
  // If the operator wants to keep refining after the agent already
  // produced a quote (`converged`), reopen the conversation so a fresh
  // exchange can update the draft.
  if (conv.status === 'converged') {
    await storage.reopenDiscoveryConversation({ conversationId, now: now() })
  }
  const row = await storage.appendDiscoveryMessage({
    id: newId(),
    conversationId,
    role: 'user',
    content,
    model: null,
    tokensIn: 0,
    tokensOut: 0,
    costCents: 0,
    now: now(),
  })
  return ucOk(discoveryMessageDTO(row))
}

export async function appendAgentMessage(
  deps: CoreDeps,
  conversationId: string,
  args: {
    content: string
    model: string | null
    tokensIn: number
    tokensOut: number
    costCents: number
  },
): Promise<UseCaseResult<DiscoveryMessageDTO>> {
  const { storage, newId, now } = deps
  const conv = await storage.getDiscoveryConversationById(conversationId)
  if (!conv) return notFound('discovery_conversation', conversationId)
  const row = await storage.appendDiscoveryMessage({
    id: newId(),
    conversationId,
    role: 'agent',
    content: args.content,
    model: args.model,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    costCents: args.costCents,
    now: now(),
  })
  return ucOk(discoveryMessageDTO(row))
}

export async function attachStoriesDraft(
  deps: CoreDeps,
  conversationId: string,
  stories: DiscoveryStoryDraftDTO[],
): Promise<UseCaseResult<DiscoveryConversationDTO>> {
  const { storage, now } = deps
  const conv = await storage.getDiscoveryConversationById(conversationId)
  if (!conv) return notFound('discovery_conversation', conversationId)
  if (conv.status === 'archived') {
    return state(`conversation ${conversationId} is archived`)
  }
  const row = await storage.attachDiscoveryStoriesDraft({
    conversationId,
    storiesDraftJson: JSON.stringify(stories),
    now: now(),
  })
  return ucOk(discoveryConversationDTO(row))
}

export async function approveAndMaterialize(
  deps: CoreDeps,
  conversationId: string,
): Promise<UseCaseResult<DiscoveryConversationDTO>> {
  const { storage, now } = deps
  const conv = await storage.getDiscoveryConversationById(conversationId)
  if (!conv) return notFound('discovery_conversation', conversationId)
  if (conv.status !== 'converged') {
    return state(`conversation must be 'converged' before approving (was ${conv.status})`)
  }
  // The actual materialization (creating stories + tasks) is done by the
  // caller because it needs the quote/project context already loaded in
  // the transport layer. This use case just flips the status.
  const row = await storage.approveDiscoveryConversation({
    conversationId,
    now: now(),
  })
  return ucOk(discoveryConversationDTO(row))
}
