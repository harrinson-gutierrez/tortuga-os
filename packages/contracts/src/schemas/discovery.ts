import { z } from 'zod'

export const StartDiscoveryConversationInput = z.object({
  provider: z.enum(['anthropic-sdk', 'claude-cli']).default('claude-cli'),
})
export type StartDiscoveryConversationInput = z.infer<typeof StartDiscoveryConversationInput>

export const SendDiscoveryMessageInput = z.object({
  content: z.string().min(1).max(8000),
})
export type SendDiscoveryMessageInput = z.infer<typeof SendDiscoveryMessageInput>

export const DiscoveryStoryDraftSchema = z.object({
  title: z.string().min(1).max(160),
  goal: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).default([]),
  estimatedHours: z.number().min(0).max(200).default(0),
  priority: z.number().int().min(1).max(5).default(3),
})
export type DiscoveryStoryDraft = z.infer<typeof DiscoveryStoryDraftSchema>

export const ApproveDiscoveryConversationInput = z.object({
  storiesDraft: z.array(DiscoveryStoryDraftSchema).min(1),
})
export type ApproveDiscoveryConversationInput = z.infer<typeof ApproveDiscoveryConversationInput>
