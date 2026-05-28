/**
 * Tortuga OS — MCP server (stdio) entrypoint.
 *
 * The tool surface lives in @tortuga-os/mcp-server. This file:
 *   1. forces logs to stderr (the SDK uses stdout for JSON-RPC),
 *   2. initialises the DB and builds CoreDeps,
 *   3. connects the prebuilt MCP server to stdio transport.
 */

process.env.TORTUGA_LOG_TO_STDERR = '1'

import { StdioServerTransport, buildMcpServer } from '@tortuga-os/mcp-server'
import { coreDeps } from '../shared/core-deps'
import { initDb } from '../shared/db'

async function main() {
  await initDb()
  const server = buildMcpServer({ core: coreDeps(), logToStderr: true })
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[mcp] Tortuga OS MCP server connected (stdio)\n')
}

main().catch((err) => {
  process.stderr.write(`[mcp] fatal: ${(err as Error).message}\n`)
  process.exit(1)
})
