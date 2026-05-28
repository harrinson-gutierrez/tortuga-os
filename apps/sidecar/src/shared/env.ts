import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * Path resolution for the Tortuga OS environment.
 *
 * Three modes:
 * 1. **dev** (`pnpm sidecar dev`): paths relative to the monorepo.
 * 2. **bundled standalone** (`node dist-bundle/sidecar.cjs`): paths relative
 *    to the bundle directory (`dist-bundle/`).
 * 3. **bundled inside Tauri**: Tauri injects `TORTUGA_DATA_DIR` and
 *    `TORTUGA_RESOURCE_DIR` pointing to `%APPDATA%` and the .exe resource
 *    directory respectively.
 */

const isDev = process.env.NODE_ENV !== 'production'

function detectResourceDir(): string {
  // 1. Tauri injects this env var when packaging
  if (process.env.TORTUGA_RESOURCE_DIR) return process.env.TORTUGA_RESOURCE_DIR
  // 2. If argv[1] ends in one of our bundles, resources sit next to it.
  //    The MCP server (mcp-server.cjs) and the HTTP sidecar (sidecar.cjs)
  //    are both spawned with their absolute path as argv[1].
  const entry = process.argv[1] ?? ''
  if (entry.endsWith('sidecar.cjs') || entry.endsWith('mcp-server.cjs')) {
    return dirname(entry)
  }
  // 3. Dev mode: go up from apps/sidecar to the monorepo root
  return resolve(process.cwd(), '../..')
}

const resourceDir = detectResourceDir()

function resolveMigrationsPath(): string {
  const bundled = join(resourceDir, 'migrations')
  if (existsSync(bundled)) return bundled
  return join(resourceDir, 'packages/storage-sqlite/migrations')
}

function resolveDataDir(): string {
  if (process.env.TORTUGA_DATA_DIR) return process.env.TORTUGA_DATA_DIR
  if (!isDev) {
    // %APPDATA%\Tortuga-OS  (Windows) | ~/.tortuga-os (Linux/Mac)
    if (process.platform === 'win32' && process.env.APPDATA) {
      return join(process.env.APPDATA, 'Tortuga-OS')
    }
    return join(homedir(), '.tortuga-os')
  }
  return join(resourceDir, 'data/dev')
}

export const env = {
  isDev,
  port: Number.parseInt(process.env.PORT ?? '0', 10), // 0 = OS-assigned random port
  logLevel: process.env.LOG_LEVEL ?? 'info',
  dataDir: resolveDataDir(),
  resourceDir,
}

export const dbPath = join(env.dataDir, 'tortuga.db')
export const migrationsPath = resolveMigrationsPath()

/**
 * Outcome of {@link assertRequiredEnv}. `ok=false` means the sidecar must exit
 * with a non-zero status — the message goes to stderr verbatim so the Rust
 * shell can surface it.
 */
export interface EnvCheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const VALID_LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])

/**
 * Validates the environment at boot. Call before `initDb()` so a misconfigured
 * sidecar dies with a clear message instead of crashing 200 lines later.
 *
 * Modes:
 *  - **prod** (`NODE_ENV=production`, e.g. bundled inside Tauri): strict.
 *    `TORTUGA_HANDSHAKE_TOKEN` is REQUIRED — without it any local process can
 *    talk to the sidecar. Token must be ≥16 chars.
 *  - **dev** (default): permissive. Only emits warnings for missing/invalid
 *    optional vars so `pnpm dev` keeps working without ceremony.
 *
 * Returns the result rather than throwing — `main.ts` decides whether to log
 * + exit(1) or continue with warnings.
 */
export function assertRequiredEnv(): EnvCheckResult {
  const errors: string[] = []
  const warnings: string[] = []
  const runtimeIsDev = process.env.NODE_ENV !== 'production'

  const handshake = process.env.TORTUGA_HANDSHAKE_TOKEN ?? ''
  if (!runtimeIsDev) {
    if (!handshake.trim()) {
      errors.push(
        'TORTUGA_HANDSHAKE_TOKEN is required in production. The Tauri shell normally injects it; if you are running the bundle directly, set it to a random ≥16-char string.',
      )
    } else if (handshake.length < 16) {
      errors.push(
        `TORTUGA_HANDSHAKE_TOKEN is too short (${handshake.length} chars). Use ≥16 chars to make it unguessable.`,
      )
    }
  } else if (handshake && handshake.length < 16) {
    warnings.push(
      `TORTUGA_HANDSHAKE_TOKEN is set but only ${handshake.length} chars. Dev mode tolerates it; production would refuse.`,
    )
  }

  const rawPort = process.env.PORT
  if (rawPort !== undefined) {
    const parsed = Number(rawPort)
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
      errors.push(`PORT=${rawPort} is not a valid port (expected integer 0-65535).`)
    }
  }

  const rawLevel = process.env.LOG_LEVEL
  if (rawLevel && !VALID_LOG_LEVELS.has(rawLevel)) {
    warnings.push(
      `LOG_LEVEL=${rawLevel} is not a recognised pino level. Falling back to "info". Valid: ${[...VALID_LOG_LEVELS].join(', ')}.`,
    )
  }

  const rawConcurrency = process.env.TORTUGA_MAX_CONCURRENT_RUNS
  if (rawConcurrency !== undefined) {
    const parsed = Number(rawConcurrency)
    if (!Number.isInteger(parsed) || parsed < 1) {
      errors.push(
        `TORTUGA_MAX_CONCURRENT_RUNS=${rawConcurrency} must be an integer ≥1 (got ${rawConcurrency}).`,
      )
    }
  }

  if (process.env.TORTUGA_AGENTS_DIR && !existsSync(process.env.TORTUGA_AGENTS_DIR)) {
    errors.push(
      `TORTUGA_AGENTS_DIR points to a path that does not exist: ${process.env.TORTUGA_AGENTS_DIR}`,
    )
  }

  if (process.env.TORTUGA_RESOURCE_DIR && !existsSync(process.env.TORTUGA_RESOURCE_DIR)) {
    errors.push(
      `TORTUGA_RESOURCE_DIR points to a path that does not exist: ${process.env.TORTUGA_RESOURCE_DIR}`,
    )
  }

  return { ok: errors.length === 0, errors, warnings }
}
