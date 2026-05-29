import { z } from 'zod'
import { ROLES } from '../enums'

export const StepAckKind = z.enum(['ok', 'fail'])
export type StepAckKind = z.infer<typeof StepAckKind>

export const UpsertStepAckInput = z.object({
  stepId: z.string().min(1).max(64),
  ack: StepAckKind,
  ackedByRole: z.enum(ROLES),
  notes: z.string().optional(),
})
export type UpsertStepAckInput = z.infer<typeof UpsertStepAckInput>

export interface StepAckDTO {
  id: string
  taskId: string
  iterationN: number
  stepId: string
  ack: StepAckKind
  ackedByRole: (typeof ROLES)[number]
  notes: string | null
  ackedAt: number
}
