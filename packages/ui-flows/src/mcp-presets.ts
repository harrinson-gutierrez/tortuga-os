import type { CreateProjectMcpInput } from '@tortuga-os/contracts'

export type McpPresetFieldKind = 'text' | 'secret'

export interface McpPresetField {
  key: string
  label: string
  kind: McpPresetFieldKind
  required: boolean
  placeholder?: string
  help?: string
  secretName?: string
}

export interface McpPreset {
  id: string
  label: string
  description: string
  transport: 'stdio' | 'http'
  command?: string
  argsTemplate?: string[]
  urlTemplate?: string
  headersTemplate?: Record<string, string>
  envTemplate?: Record<string, string>
  fields: McpPresetField[]
  defaultName: string
  defaultDescription: string
  docsUrl: string
  notes?: string
}

const interpolate = (tpl: string, values: Record<string, string>): string =>
  tpl.replace(/\$\{(\w+)\}|\{\{(\w+)\}\}/g, (_m, a, b) => values[a ?? b] ?? '')

export interface BuiltMcpInput {
  createInput: CreateProjectMcpInput
  secretsToCreate: Array<{ name: string; value: string; description?: string }>
}

export function buildCreateInputFromPreset(
  preset: McpPreset,
  values: Record<string, string>,
): BuiltMcpInput {
  const secretsToCreate = preset.fields
    .filter((f) => f.kind === 'secret' && f.secretName && values[f.key])
    .map((f) => ({
      name: f.secretName as string,
      value: values[f.key] as string,
      description: `Auto-creado por preset MCP "${preset.label}"`,
    }))

  const envResolved = preset.envTemplate
    ? Object.fromEntries(
        Object.entries(preset.envTemplate).map(([k, v]) => [k, interpolate(v, values)]),
      )
    : undefined

  const argsResolved = preset.argsTemplate?.map((a) => interpolate(a, values))
  const urlResolved = preset.urlTemplate ? interpolate(preset.urlTemplate, values) : undefined
  const headersResolved = preset.headersTemplate
    ? Object.fromEntries(
        Object.entries(preset.headersTemplate).map(([k, v]) => [k, interpolate(v, values)]),
      )
    : undefined

  const base = {
    name: preset.defaultName,
    description: preset.defaultDescription,
    transport: preset.transport,
    enabled: true,
    presetId: preset.id,
  } as const

  const createInput =
    preset.transport === 'stdio'
      ? {
          ...base,
          command: preset.command,
          ...(argsResolved && argsResolved.length > 0 ? { args: argsResolved } : {}),
          ...(envResolved && Object.keys(envResolved).length > 0 ? { env: envResolved } : {}),
        }
      : {
          ...base,
          url: urlResolved,
          ...(headersResolved && Object.keys(headersResolved).length > 0
            ? { headers: headersResolved }
            : {}),
        }

  return { createInput: createInput as CreateProjectMcpInput, secretsToCreate }
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'supabase',
    label: 'Supabase',
    description: 'Postgres, Auth, Storage, Edge Functions del proyecto Supabase.',
    transport: 'stdio',
    command: 'npx',
    argsTemplate: [
      '-y',
      '@supabase/mcp-server-supabase@latest',
      '--read-only',
      '--project-ref={{project_ref}}',
    ],
    envTemplate: { SUPABASE_ACCESS_TOKEN: '${access_token}' },
    fields: [
      {
        key: 'project_ref',
        label: 'Project ref',
        kind: 'text',
        required: true,
        placeholder: 'abcdefghijklmnopqrst',
        help: 'Visible en el dashboard de Supabase, Settings → General.',
      },
      {
        key: 'access_token',
        label: 'Personal Access Token',
        kind: 'secret',
        required: true,
        placeholder: 'sbp_...',
        secretName: 'SUPABASE_ACCESS_TOKEN',
        help: 'Generar en supabase.com/dashboard/account/tokens.',
      },
    ],
    defaultName: 'supabase',
    defaultDescription: 'Supabase (read-only)',
    docsUrl: 'https://supabase.com/docs/guides/getting-started/mcp',
    notes: 'Modo read-only por defecto. Quita --read-only del comando si necesitas writes.',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Repos, PRs, issues, actions vía el MCP oficial de GitHub.',
    transport: 'http',
    urlTemplate: 'https://api.githubcopilot.com/mcp/',
    headersTemplate: { Authorization: 'Bearer ${pat}' },
    fields: [
      {
        key: 'pat',
        label: 'GitHub Personal Access Token',
        kind: 'secret',
        required: true,
        placeholder: 'ghp_... o github_pat_...',
        secretName: 'GITHUB_PAT',
        help: 'Scopes mínimos: repo + read:org.',
      },
    ],
    defaultName: 'github',
    defaultDescription: 'GitHub (PRs, issues, repos)',
    docsUrl: 'https://github.com/github/github-mcp-server',
  },
  {
    id: 'linear',
    label: 'Linear',
    description: 'Issues, projects, cycles del workspace Linear.',
    transport: 'http',
    urlTemplate: 'https://mcp.linear.app/mcp',
    headersTemplate: { Authorization: 'Bearer ${api_key}' },
    fields: [
      {
        key: 'api_key',
        label: 'Linear API Key',
        kind: 'secret',
        required: true,
        placeholder: 'lin_api_...',
        secretName: 'LINEAR_API_KEY',
        help: 'Generar en linear.app/settings/api.',
      },
    ],
    defaultName: 'linear',
    defaultDescription: 'Linear (issues, projects)',
    docsUrl: 'https://linear.app/docs/mcp',
  },
  {
    id: 'sentry',
    label: 'Sentry',
    description: 'Issues, events, releases del workspace Sentry.',
    transport: 'http',
    urlTemplate: 'https://mcp.sentry.dev/mcp',
    headersTemplate: { Authorization: 'Bearer ${auth_token}' },
    fields: [
      {
        key: 'auth_token',
        label: 'Sentry User Auth Token',
        kind: 'secret',
        required: true,
        placeholder: 'sntryu_...',
        secretName: 'SENTRY_ACCESS_TOKEN',
        help: 'Scopes: org:read, project:read, event:read.',
      },
    ],
    defaultName: 'sentry',
    defaultDescription: 'Sentry (issues, events)',
    docsUrl: 'https://docs.sentry.io/ai/mcp/',
  },
  {
    id: 'stripe',
    label: 'Stripe',
    description: 'Customers, charges, subscriptions vía el MCP oficial de Stripe.',
    transport: 'stdio',
    command: 'npx',
    argsTemplate: ['-y', '@stripe/mcp', '--tools=all'],
    envTemplate: { STRIPE_SECRET_KEY: '${secret_key}' },
    fields: [
      {
        key: 'secret_key',
        label: 'Stripe API Key',
        kind: 'secret',
        required: true,
        placeholder: 'rk_live_... o sk_test_...',
        secretName: 'STRIPE_SECRET_KEY',
        help: 'Prefiere Restricted API Keys (rk_) para limitar permisos.',
      },
    ],
    defaultName: 'stripe',
    defaultDescription: 'Stripe (customers, charges)',
    docsUrl: 'https://docs.stripe.com/mcp',
  },
  {
    id: 'figma',
    label: 'Figma (Dev Mode)',
    description: 'Lee frames y design tokens del archivo Figma abierto en Desktop.',
    transport: 'http',
    urlTemplate: 'http://127.0.0.1:3845/mcp',
    fields: [],
    defaultName: 'figma',
    defaultDescription: 'Figma Dev Mode (loopback)',
    docsUrl:
      'https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server',
    notes:
      'Requiere Figma Desktop con "Enable local MCP server" activado en Preferences. Sin auth, solo loopback.',
  },
  {
    id: 'tortuga-os',
    label: 'Tortuga OS (workspace)',
    description: 'Acceso al workspace local del proyecto (filesystem + scaffold).',
    transport: 'stdio',
    command: 'node',
    argsTemplate: ['{{sidecar_path}}/mcp-server.cjs'],
    fields: [
      {
        key: 'sidecar_path',
        label: 'Ruta al sidecar dist-bundle',
        kind: 'text',
        required: true,
        placeholder: '/ruta/absoluta/a/tortuga-os/apps/sidecar/dist-bundle',
        help: 'Apunta al dist-bundle del sidecar bundled. Se resuelve solo cuando arrancas vía Tauri.',
      },
    ],
    defaultName: 'tortuga-os',
    defaultDescription: 'Tortuga OS workspace bridge',
    docsUrl: 'https://github.com/harrinson-gutierrez/tortuga-os',
    notes: 'Auto-instalado por bootstrap del workspace. Reinstálalo aquí si lo borraste por error.',
  },
]
