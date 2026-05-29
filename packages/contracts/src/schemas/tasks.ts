import { z } from 'zod'
import { ROLES, TASK_TYPES } from '../enums'

export const CreateTaskInput = z.object({
  storyId: z.string().min(1),
  code: z.string().min(1).max(64),
  type: z.enum(TASK_TYPES),
  ownerRole: z.enum(ROLES),
  assignee: z.string().nullable().optional(),
  estimatedHoursMin: z.number().int().nonnegative().default(0),
})
export type CreateTaskInput = z.infer<typeof CreateTaskInput>

export const PatchTaskInput = z.object({
  assignee: z.string().nullable().optional(),
  estimatedHoursMin: z.number().int().nonnegative().optional(),
})
export type PatchTaskInput = z.infer<typeof PatchTaskInput>

export const ApproveTaskInput = z.object({
  closedByRole: z.enum(ROLES),
  notes: z.string().optional(),
})
export type ApproveTaskInput = z.infer<typeof ApproveTaskInput>

export const RejectTaskInput = z.object({
  closedByRole: z.enum(ROLES),
  notes: z.string().min(1),
})
export type RejectTaskInput = z.infer<typeof RejectTaskInput>

export const ReopenTaskInput = z.object({
  closedByRole: z.enum(ROLES),
  notes: z.string().optional(),
})
export type ReopenTaskInput = z.infer<typeof ReopenTaskInput>
