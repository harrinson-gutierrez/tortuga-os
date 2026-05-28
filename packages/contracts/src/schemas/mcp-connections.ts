import { z } from 'zod'

/**
 * Server name as referenced by Claude CLI in its --mcp-config JSON.
 * Must be safe to embed without escaping and easy to type at a CLI.
 * Lowercase, digits, single-dashes; 1-31 chars total.
 *
 * Scoped per project: the same name can exist in multiple projects but
 * not twice in the same project (enforced by UNIQUE(project_id, name)).
 */
export const ProjectMcpName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/, {
  message: 'name must match ^[a-z0-9][a-z0-9-]{0,30}$ (lowercase, digits, dashes)',
})

export const McpTransport = z.enum(['stdio', 'http'])
export type McpTransport = z.infer<typeof McpTransport>

const stdioFields = z.object({
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
})

const httpFields = z.object({
  url: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
})

export const CreateProjectMcpInput = z
  .object({
    name: ProjectMcpName,
    description: z.string().optional(),
    transport: McpTransport,
    enabled: z.boolean().optional(),
    /** Optional catalog preset id (e.g. 'supabase'). NULL for custom MCPs. */
    presetId: z.string().min(1).optional(),
  })
  .and(stdioFields)
  .and(httpFields)
  .superRefine((val, ctx) => {
    if (val.transport === 'stdio') {
      if (!val.command || val.command.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['command'],
          message: 'stdio transport requires a non-empty command',
        })
      }
    } else if (val.transport === 'http') {
      if (!val.url || val.url.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['url'],
          message: 'http transport requires a url',
        })
      }
    }
  })
export type CreateProjectMcpInput = z.infer<typeof CreateProjectMcpInput>

export const PatchProjectMcpInput = z.object({
  name: ProjectMcpName.optional(),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.string().url().nullable().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  presetId: z.string().min(1).nullable().optional(),
})
export type PatchProjectMcpInput = z.infer<typeof PatchProjectMcpInput>
