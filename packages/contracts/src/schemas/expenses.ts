import { z } from 'zod'

export const ExpenseCategory = z.enum([
  'contractor',
  'saas',
  'hosting',
  'license',
  'hardware',
  'travel',
  'other',
])
export type ExpenseCategory = z.infer<typeof ExpenseCategory>

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

export const CreateExpenseInput = z.object({
  projectCode: z.string().min(1),
  category: ExpenseCategory,
  vendor: z.string().max(160).optional(),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().nonnegative(),
  incurredOn: isoDate,
  receiptPath: z.string().max(1000).optional(),
})
export type CreateExpenseInput = z.infer<typeof CreateExpenseInput>

export const PatchExpenseInput = z.object({
  category: ExpenseCategory.optional(),
  vendor: z.string().max(160).nullable().optional(),
  description: z.string().min(1).max(500).optional(),
  amountCents: z.number().int().nonnegative().optional(),
  incurredOn: isoDate.optional(),
  receiptPath: z.string().max(1000).nullable().optional(),
})
export type PatchExpenseInput = z.infer<typeof PatchExpenseInput>
