import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import { McpClient, type ToolCallResult } from './mcp-client'

/**
 * Resolve the Supabase MCP server configuration for a project and spawn
 * a one-shot client. Caller is responsible for `close()`-ing it.
 *
 * Resolution:
 *  1. Look for an mcp_connections row named 'supabase' (or
 *     'supabase-<projectCode>' if you ever scope per project).
 *  2. Decrypt project secrets and require SUPABASE_ACCESS_TOKEN to be set.
 *  3. Build env = mcp.envJson + { SUPABASE_ACCESS_TOKEN }.
 *  4. start() the client (initialize handshake).
 *
 * Returns null when no MCP row exists OR the token is missing — caller
 * surfaces that as a `requiredOperatorAction` to the operator.
 */

export interface SupabaseMcpResolution {
  client: McpClient
  serverName: string
}

export async function openSupabaseMcpForProject(
  deps: CoreDeps,
  projectId: string,
): Promise<
  | { ok: true; resolution: SupabaseMcpResolution }
  | { ok: false; reason: 'no-connection' | 'no-token' | 'spawn-failed'; detail: string }
> {
  const connections = await deps.storage.listProjectMcps(projectId)
  const supabaseRow = connections.find((c) => c.enabled && c.name.toLowerCase() === 'supabase')
  if (!supabaseRow) {
    return {
      ok: false,
      reason: 'no-connection',
      detail:
        'No enabled "supabase" MCP installed for this project. Install it from the project → MCPs tab (see docs/MCP-SUPABASE-SETUP.md).',
    }
  }
  if (supabaseRow.transport !== 'stdio') {
    return {
      ok: false,
      reason: 'no-connection',
      detail: `project mcp "supabase" has transport=${supabaseRow.transport}; only stdio is supported`,
    }
  }

  // Decrypt project secrets and find SUPABASE_ACCESS_TOKEN (account-scoped
  // personal access token, NOT a service_role key).
  const secrets = await useCases.secrets.decryptSecretsForProject(deps, projectId)
  const token = secrets.SUPABASE_ACCESS_TOKEN ?? secrets.supabase_access_token
  if (!token) {
    return {
      ok: false,
      reason: 'no-token',
      detail:
        'Project secret SUPABASE_ACCESS_TOKEN missing. Generate one at https://supabase.com/dashboard/account/tokens and add it via Project → Secrets.',
    }
  }

  // Merge MCP row env (parsed from JSON) + the access token. The CLI mcp
  // server reads SUPABASE_ACCESS_TOKEN from env.
  const rowEnv: Record<string, string> = {}
  try {
    const parsed = JSON.parse(supabaseRow.envJson)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') rowEnv[k] = v
      }
    }
  } catch {
    /* fall through with empty env */
  }
  let args: string[] = []
  try {
    const parsed = JSON.parse(supabaseRow.argsJson)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      args = parsed as string[]
    }
  } catch {
    /* fall through with no args */
  }

  const client = new McpClient({
    command: supabaseRow.command,
    args,
    env: { ...rowEnv, SUPABASE_ACCESS_TOKEN: token },
  })
  try {
    await client.start()
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'supabase mcp spawn failed')
    await client.close()
    return {
      ok: false,
      reason: 'spawn-failed',
      detail: (err as Error).message,
    }
  }
  return {
    ok: true,
    resolution: { client, serverName: supabaseRow.name },
  }
}

/**
 * Apply a single SQL migration body via the Supabase MCP `apply_migration`
 * tool. The MCP server expects { project_id, name, query }.
 *
 * We resolve project_id from a project secret SUPABASE_PROJECT_REF if
 * present; otherwise the caller must pass it. The MCP enforces the
 * project belongs to the same account as the access token.
 */
export interface ApplyMigrationArgs {
  client: McpClient
  projectRef: string
  name: string
  body: string
}

export async function applyMigrationViaMcp(args: ApplyMigrationArgs): Promise<ToolCallResult> {
  return args.client.callTool('apply_migration', {
    project_id: args.projectRef,
    name: args.name,
    query: args.body,
  })
}

export async function resolveSupabaseProjectRef(
  deps: CoreDeps,
  projectId: string,
): Promise<string | null> {
  // Two possible sources:
  //  1. Project secret SUPABASE_PROJECT_REF (preferred — encrypted).
  //  2. Project env var SUPABASE_PROJECT_REF for any environment.
  const secrets = await useCases.secrets.decryptSecretsForProject(deps, projectId)
  if (secrets.SUPABASE_PROJECT_REF) return secrets.SUPABASE_PROJECT_REF
  const envs = await deps.storage.listProjectEnvs(projectId)
  const match = envs.find((e) => e.name === 'SUPABASE_PROJECT_REF')
  return match?.value ?? null
}
