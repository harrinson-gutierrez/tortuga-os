// Global setup for e2e tests:
// - Point TORTUGA_DATA_DIR at an OS temp dir so workspace scaffolding never
//   touches the repo. Must be set BEFORE any sidecar import — hence the dynamic
//   handshake import below.
// - Keep the handshake middleware disabled in tests (TORTUGA_HANDSHAKE_TOKEN unset).
// - Silence the pino logger so test output stays readable.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.TORTUGA_DATA_DIR =
  process.env.TORTUGA_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'tortuga-test-'))
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent'

// Dynamic import AFTER env vars are set (env.ts reads them on load).
const { _resetHandshakeCacheForTests } = await import('../apps/sidecar/src/shared/handshake')
process.env.TORTUGA_HANDSHAKE_TOKEN = undefined
_resetHandshakeCacheForTests()
