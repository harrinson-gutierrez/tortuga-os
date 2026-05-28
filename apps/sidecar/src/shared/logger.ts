import pino from 'pino'
import { env } from './env'

/**
 * Shared logger. Writes to stdout by default.
 *
 * When this sidecar runs as an MCP server (`TORTUGA_LOG_TO_STDERR=1`), we force
 * logs to stderr so they do not break the JSON-RPC stdio handshake that MCP
 * uses over stdout.
 */
// Force stderr in two cases:
// 1. The env var is explicitly set (handy for tests or alternate stdio).
// 2. The bundle running is the MCP server — stdout there belongs to the
//    JSON-RPC transport and ANY log line corrupts the handshake. Checking
//    argv[1] survives the esbuild CJS hoist that re-orders top-level
//    statements and breaks the previous "set env var before import" trick.
const argv1 = process.argv[1] ?? ''
const useStderr = process.env.TORTUGA_LOG_TO_STDERR === '1' || argv1.endsWith('mcp-server.cjs')
const destination = useStderr ? pino.destination(2) : undefined

/**
 * Redact paths — fields that must NEVER appear in the logs.
 *
 * Covers:
 *   - The handshake token and auth headers
 *   - Client and lead PII (taxId, email, phone)
 *   - Secrets in bodies and query params
 *
 * Uses the `*.password`, `*.token`, etc. wildcards to capture them at any
 * nesting level (Pino supports nested paths with dot/star).
 */
const REDACT_PATHS: string[] = [
  // HTTP headers
  'req.headers.authorization',
  'req.headers["x-tortuga-secret"]',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  // Bodies
  'req.body.password',
  'req.body.token',
  'req.body.secret',
  'req.body.handshake',
  'req.body.contactEmail',
  'req.body.email',
  'req.body.phone',
  'req.body.taxId',
  // Top-level keys we pass directly to the logger
  'password',
  'token',
  'secret',
  'handshake',
  'authorization',
  'apiKey',
  'api_key',
  'accessToken',
  'refreshToken',
  'sessionToken',
  'taxId',
  'contactEmail',
  // Wildcards for nested objects (clients, leads, people)
  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.taxId',
  '*.contactEmail',
  '*.phone',
]

export const logger = pino(
  {
    level: env.logLevel,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
      remove: false,
    },
    transport:
      env.isDev && !useStderr
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss.l',
              ignore: 'pid,hostname',
              destination: 1,
            },
          }
        : undefined,
  },
  destination,
)
