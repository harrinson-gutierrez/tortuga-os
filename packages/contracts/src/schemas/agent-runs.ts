import { z } from 'zod'
import { AGENT_KINDS, AGENT_PROVIDERS } from '../enums'

export const CreateAgentRunInput = z.object({
  taskId: z.string().min(1),
  agentKind: z.enum(AGENT_KINDS),
  provider: z.enum(AGENT_PROVIDERS).default('claude-cli'),
  model: z.string().optional(),
  /** Optional extra user-supplied prompt appended to the agent's system prompt. */
  extraPrompt: z.string().optional(),
})
export type CreateAgentRunInput = z.infer<typeof CreateAgentRunInput>
