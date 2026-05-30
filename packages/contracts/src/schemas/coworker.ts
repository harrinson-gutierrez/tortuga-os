import { z } from 'zod'
import { TASK_COWORKER_PHASES, TASK_EXECUTION_MODES } from '../enums'

export const SendTaskMessageInput = z.object({
  content: z.string().min(1).max(8000),
})
export type SendTaskMessageInput = z.infer<typeof SendTaskMessageInput>

export const SetExecutionModeInput = z.object({
  mode: z.enum(TASK_EXECUTION_MODES),
})
export type SetExecutionModeInput = z.infer<typeof SetExecutionModeInput>

export const SetTaskCoworkerPhaseInput = z.object({
  phase: z.enum(TASK_COWORKER_PHASES),
})
export type SetTaskCoworkerPhaseInput = z.infer<typeof SetTaskCoworkerPhaseInput>
