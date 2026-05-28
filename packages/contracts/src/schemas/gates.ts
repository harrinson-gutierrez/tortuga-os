import { z } from 'zod'
import { GATE_TYPES } from '../enums'

export const CreateGateInput = z.object({
  taskId: z.string().min(1),
  iterationId: z.string().min(1),
  gateType: z.enum(GATE_TYPES),
})
export type CreateGateInput = z.infer<typeof CreateGateInput>

export const RecordGateOutcomeInput = z.object({
  status: z.enum(['passed', 'failed', 'skipped']),
  outputPath: z.string().nullable().optional(),
  /** Override a previously-recorded outcome (manual operator action). */
  force: z.boolean().optional(),
})
export type RecordGateOutcomeInput = z.infer<typeof RecordGateOutcomeInput>
