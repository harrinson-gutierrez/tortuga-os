import { z } from 'zod'

/** Safe to inject as an env var name to subprocess agents. */
export const SecretName = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, {
  message: 'name must be SHOUT_CASE (start with letter, up to 64 chars, A-Z 0-9 _)',
})

export const CreateSecretInput = z.object({
  projectCode: z.string().min(1),
  name: SecretName,
  description: z.string().max(500).optional(),
  /** Plain-text value. Will be AES-256-GCM encrypted on storage. */
  value: z.string().min(1).max(8000),
})
export type CreateSecretInput = z.infer<typeof CreateSecretInput>

export const PatchSecretInput = z.object({
  description: z.string().max(500).nullable().optional(),
  /** Replace the encrypted value. Omit to leave it intact. */
  value: z.string().min(1).max(8000).optional(),
})
export type PatchSecretInput = z.infer<typeof PatchSecretInput>
