import { z } from 'zod'

const KitStorySnapshot = z.object({
  code: z.string().optional(),
  title: z.string().min(1).max(160),
  goal: z.string().min(1).max(2000),
  acceptanceCriteria: z.array(z.string()).optional(),
  estimatedHoursMin: z.number().int().nonnegative().optional(),
})

const KitModuleSnapshot = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  defaultHoursByRole: z.record(z.string(), z.number().int().nonnegative()).optional(),
  defaultMarginBps: z.number().int().min(0).max(100_000).optional(),
})

const KitMilestoneSnapshot = z.object({
  label: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  percentageBps: z.number().int().min(0).max(10000),
})

export const KitSnapshot = z.object({
  stories: z.array(KitStorySnapshot).optional(),
  modules: z.array(KitModuleSnapshot).optional(),
  milestones: z.array(KitMilestoneSnapshot).optional(),
})
export type KitSnapshot = z.infer<typeof KitSnapshot>

export const CreateKitTemplateInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  stack: z.string().min(1).max(60),
  snapshot: KitSnapshot.optional(),
})
export type CreateKitTemplateInput = z.infer<typeof CreateKitTemplateInput>

export const PatchKitTemplateInput = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  stack: z.string().min(1).max(60).optional(),
  snapshot: KitSnapshot.optional(),
})
export type PatchKitTemplateInput = z.infer<typeof PatchKitTemplateInput>
