import { z } from 'zod'

export const CreatePersonInput = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
})
export type CreatePersonInput = z.infer<typeof CreatePersonInput>

export const PatchPersonInput = CreatePersonInput.partial()
export type PatchPersonInput = z.infer<typeof PatchPersonInput>
