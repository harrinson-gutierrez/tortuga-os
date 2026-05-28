import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CoreDeps, UseCaseResult } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'

const TOOL_TIMEOUT_MS = 30_000
const MAX_TOOL_OUTPUT_BYTES = 1 * 1024 * 1024

function truncate(json: string): string {
  if (Buffer.byteLength(json, 'utf-8') <= MAX_TOOL_OUTPUT_BYTES) return json
  return `${json.slice(0, MAX_TOOL_OUTPUT_BYTES)}\n…[truncated]`
}

function runWithTimeout<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`tool ${label} exceeded ${TOOL_TIMEOUT_MS}ms`)),
      TOOL_TIMEOUT_MS,
    )
    fn()
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        reject(e)
      })
  })
}

function unwrap<T>(r: UseCaseResult<T>): T {
  if (r.ok) return r.value
  throw new Error(`${r.error.code}: ${JSON.stringify(r.error)}`)
}

interface TortugaMcpDeps {
  core: CoreDeps
  /** Optional: write log lines to stderr so they don't pollute MCP stdout. */
  logToStderr?: boolean
}

interface ToolSpec<I> {
  description: string
  inputSchema: object
  run(args: I): Promise<unknown>
}

function buildTools(deps: CoreDeps): Record<string, ToolSpec<unknown>> {
  return {
    tortuga_list_projects: {
      description: 'List all active projects with their client.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => unwrap(await useCases.projects.listProjects(deps)),
    },
    tortuga_get_project: {
      description: 'Get a project by code.',
      inputSchema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
      run: async (args) =>
        unwrap(await useCases.projects.getProjectByCode(deps, (args as { code: string }).code)),
    },
    tortuga_list_clients: {
      description: 'List all clients.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => unwrap(await useCases.clients.listClients(deps)),
    },
    tortuga_list_people: {
      description: 'List all people.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => unwrap(await useCases.people.listPeople(deps)),
    },
    tortuga_current_quote: {
      description: 'Get the latest quote for a project.',
      inputSchema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
      run: async (args) =>
        unwrap(await useCases.quotes.getCurrentQuote(deps, (args as { code: string }).code)),
    },
    tortuga_list_quotes: {
      description: 'List all quote versions of a project.',
      inputSchema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
      run: async (args) =>
        unwrap(await useCases.quotes.listQuotesForProject(deps, (args as { code: string }).code)),
    },
    tortuga_get_task: {
      description: 'Get a task by id.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
      run: async (args) => unwrap(await useCases.tasks.getTask(deps, (args as { id: string }).id)),
    },
    tortuga_project_cost_report: {
      description:
        'Get the cost report for a project: budget (from approved quote), spent, rework costs and per-phase breakdown.',
      inputSchema: {
        type: 'object',
        properties: { code: { type: 'string' } },
        required: ['code'],
      },
      run: async (args) =>
        unwrap(await useCases.reports.getProjectCostReport(deps, (args as { code: string }).code)),
    },
  }
}

/**
 * Build a Tortuga MCP server bound to the given CoreDeps. Start it with
 * `.connect(new StdioServerTransport())`.
 */
export function buildMcpServer(coreDeps: TortugaMcpDeps): Server {
  const tools = buildTools(coreDeps.core)
  const server = new Server(
    { name: 'tortuga-os', version: '0.1.2' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.entries(tools).map(([name, t]) => ({
      name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name
    const tool = tools[name]
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      }
    }
    try {
      const args = req.params.arguments ?? {}
      const result = await runWithTimeout(name, () => tool.run(args))
      return {
        content: [{ type: 'text', text: truncate(JSON.stringify(result, null, 2)) }],
      }
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err)
      if (coreDeps.logToStderr) {
        process.stderr.write(`[mcp] ${name} failed: ${msg}\n`)
      }
      return {
        content: [{ type: 'text', text: `Error: ${msg}` }],
        isError: true,
      }
    }
  })

  return server
}

export { StdioServerTransport }
