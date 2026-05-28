import { z } from 'zod'

export const ProjectEnvironment = z.enum(['dev', 'staging', 'prod'])
export type ProjectEnvironment = z.infer<typeof ProjectEnvironment>

/** Safe to inject as an env var name. */
export const ProjectEnvName = z.string().regex(/^[A-Z][A-Z0-9_]*$/, {
  message: 'name must be SHOUT_CASE (start with letter A-Z, then A-Z 0-9 _)',
})

export const CreateProjectEnvInput = z.object({
  environment: ProjectEnvironment,
  name: ProjectEnvName,
  value: z.string().max(8000),
  description: z.string().max(500).optional(),
})
export type CreateProjectEnvInput = z.infer<typeof CreateProjectEnvInput>

export const PatchProjectEnvInput = z.object({
  value: z.string().max(8000).optional(),
  description: z.string().max(500).nullable().optional(),
})
export type PatchProjectEnvInput = z.infer<typeof PatchProjectEnvInput>
