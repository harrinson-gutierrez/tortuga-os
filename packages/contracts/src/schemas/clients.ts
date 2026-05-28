import { z } from 'zod'

export const CreateClientInput = z.object({
  name: z.string().min(1),
  taxId: z.string().optional(),
  contactEmail: z.string().email().optional(),
  driveFolderId: z.string().optional(),
})
export type CreateClientInput = z.infer<typeof CreateClientInput>

export const PatchClientInput = CreateClientInput.partial()
export type PatchClientInput = z.infer<typeof PatchClientInput>
