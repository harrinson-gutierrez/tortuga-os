import { z } from 'zod'
import { ROLES } from '../enums'

export const CreateStoryInput = z.object({
  quoteId: z.string().min(1),
  code: z.string().min(1).max(64),
  title: z.string().min(1).max(160),
  goal: z.string().min(1),
  ownerRole: z.enum(ROLES),
  acceptanceCriteriaJson: z.string().default('[]'),
  inputsJson: z.string().default('{}'),
  outputsJson: z.string().default('{}'),
  verificationJson: z.string().default('{}'),
  outOfScopeJson: z.string().default('[]'),
  estimatedHoursMin: z.number().int().nonnegative().default(0),
  priority: z.number().int().min(1).max(5).default(3),
})
export type CreateStoryInput = z.infer<typeof CreateStoryInput>

export const PatchStoryInput = z.object({
  title: z.string().min(1).max(160).optional(),
  goal: z.string().min(1).optional(),
  acceptanceCriteriaJson: z.string().optional(),
  inputsJson: z.string().optional(),
  outputsJson: z.string().optional(),
  verificationJson: z.string().optional(),
  outOfScopeJson: z.string().optional(),
  estimatedHoursMin: z.number().int().nonnegative().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  ownerRole: z.enum(ROLES).optional(),
})
export type PatchStoryInput = z.infer<typeof PatchStoryInput>
