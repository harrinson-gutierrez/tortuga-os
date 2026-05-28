import { z } from 'zod'
import { CURRENCIES, PROJECT_STATUSES } from '../enums'

export const CreateProjectInput = z.object({
  code: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[A-Z][A-Z0-9_-]*$/, {
      message: 'code must be UPPERCASE alphanumeric',
    }),
  clientId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  currency: z.enum(CURRENCIES).default('COP'),
})
export type CreateProjectInput = z.infer<typeof CreateProjectInput>

export const PatchProjectInput = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  workspacePath: z.string().nullable().optional(),
})
export type PatchProjectInput = z.infer<typeof PatchProjectInput>
