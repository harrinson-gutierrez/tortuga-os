import { z } from 'zod'
import { EVIDENCE_KINDS, EVIDENCE_TYPES, ROLES } from '../enums'

export const CreateEvidenceInput = z.object({
  taskId: z.string().min(1),
  iterationId: z.string().min(1),
  type: z.enum(EVIDENCE_TYPES),
  kind: z.enum(EVIDENCE_KINDS),
  path: z.string().min(1),
  createdByRole: z.enum(ROLES),
  createdByAssignee: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
export type CreateEvidenceInput = z.infer<typeof CreateEvidenceInput>
