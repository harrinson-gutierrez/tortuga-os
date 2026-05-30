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

/**
 * A decision the coworker agent surfaces to the operator at the end of a turn,
 * instead of guessing. The chat renders the options as clickable buttons;
 * picking one is sent as the next turn. The agent emits this as a fenced
 * ```json block: { "coworkerQuestion": { "question": "...", "options": [...] } }
 */
export const CoworkerQuestion = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
})
export type CoworkerQuestion = z.infer<typeof CoworkerQuestion>

const COWORKER_QUESTION_BLOCK = /```(?:json|JSON)?\s*([\s\S]*?)```/g

/**
 * Extract the coworker question from an agent turn's text, if it ended with
 * one. Scans fenced JSON blocks (last first) for a `coworkerQuestion`. Returns
 * null when the turn carried no question — the common case.
 */
export function parseCoworkerQuestion(content: string): CoworkerQuestion | null {
  if (!content || !content.includes('coworkerQuestion')) return null
  const blocks: string[] = []
  for (const m of content.matchAll(COWORKER_QUESTION_BLOCK)) {
    if (m[1]) blocks.push(m[1])
  }
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(blocks[i]!.trim()) as { coworkerQuestion?: unknown }
      const validated = CoworkerQuestion.safeParse(parsed.coworkerQuestion)
      if (validated.success) return validated.data
    } catch {
      /* try previous block */
    }
  }
  return null
}
