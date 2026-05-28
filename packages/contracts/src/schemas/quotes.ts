import { z } from 'zod'

export const PatchQuoteInput = z.object({
  totalHoursMin: z.number().int().nonnegative().optional(),
  totalCostCents: z.number().int().nonnegative().optional(),
  /** Global discount in basis points (1% = 100). 0..10000. */
  discountBps: z.number().int().min(0).max(10000).optional(),
})
export type PatchQuoteInput = z.infer<typeof PatchQuoteInput>

export const RequestQuoteChangesInput = z.object({
  feedback: z.string().min(1),
})
export type RequestQuoteChangesInput = z.infer<typeof RequestQuoteChangesInput>

export const CreateQuoteModuleInput = z.object({
  projectCode: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  defaultHours: z.record(z.string(), z.number().int().nonnegative()).optional(),
  defaultMarginBps: z.number().int().min(0).max(100_000).optional(),
  sortOrder: z.number().int().optional(),
})
export type CreateQuoteModuleInput = z.infer<typeof CreateQuoteModuleInput>

export const PatchQuoteModuleInput = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  defaultHours: z.record(z.string(), z.number().int().nonnegative()).optional(),
  defaultMarginBps: z.number().int().min(0).max(100_000).optional(),
  sortOrder: z.number().int().optional(),
})
export type PatchQuoteModuleInput = z.infer<typeof PatchQuoteModuleInput>

export const CreateQuoteItemInput = z.object({
  quoteId: z.string().min(1),
  moduleId: z.string().nullable().optional(),
  label: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  hoursMin: z.number().int().nonnegative(),
  rateCents: z.number().int().nonnegative(),
  marginBps: z.number().int().min(0).max(100_000).optional(),
  sortOrder: z.number().int().optional(),
})
export type CreateQuoteItemInput = z.infer<typeof CreateQuoteItemInput>

export const PatchQuoteItemInput = z.object({
  label: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).nullable().optional(),
  hoursMin: z.number().int().nonnegative().optional(),
  rateCents: z.number().int().nonnegative().optional(),
  marginBps: z.number().int().min(0).max(100_000).optional(),
  sortOrder: z.number().int().optional(),
})
export type PatchQuoteItemInput = z.infer<typeof PatchQuoteItemInput>

export const CreateQuoteMilestoneInput = z.object({
  quoteId: z.string().min(1),
  label: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  percentageBps: z.number().int().min(0).max(10000),
  gateType: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type CreateQuoteMilestoneInput = z.infer<typeof CreateQuoteMilestoneInput>

export const PatchQuoteMilestoneInput = z.object({
  label: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).nullable().optional(),
  percentageBps: z.number().int().min(0).max(10000).optional(),
  gateType: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
})
export type PatchQuoteMilestoneInput = z.infer<typeof PatchQuoteMilestoneInput>
