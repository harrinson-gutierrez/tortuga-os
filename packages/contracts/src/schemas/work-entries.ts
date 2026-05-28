import { z } from 'zod'
import { ROLES } from '../enums'

export const LogWorkEntryInput = z.object({
  iterationId: z.string().min(1),
  personId: z.string().min(1),
  role: z.enum(ROLES),
  minutes: z.number().int().positive(),
  reworkTicketId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  loggedAt: z.number().int().optional(),
})
export type LogWorkEntryInput = z.infer<typeof LogWorkEntryInput>
