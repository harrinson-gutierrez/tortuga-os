import type { Hono } from 'hono'
/**
 * `buildTestApp()` builds the real Hono app with an in-memory DB injected.
 *
 * It uses `setDbForTests` to override the sidecar singleton WITHOUT opening the
 * real file. Returns `{ app, db }` — the caller can:
 *   - `app.fetch(new Request('http://test/api/projects'))` to make requests
 *     without a real server.
 *   - `db` to seed or assert against the DB directly.
 */
import { buildApp } from '../../apps/sidecar/src/server'
import { setDbForTests } from '../../apps/sidecar/src/shared/db'
import { _resetHandshakeCacheForTests } from '../../apps/sidecar/src/shared/handshake'
import type { Db } from '../../packages/db/src/client'
import { createTestDb } from './test-db'

export interface TestApp {
  app: Hono
  db: Db
}

export function buildTestApp(): TestApp {
  // Make sure the handshake is disabled for this run.
  process.env.TORTUGA_HANDSHAKE_TOKEN = undefined
  _resetHandshakeCacheForTests()

  const db = createTestDb()
  setDbForTests(db)

  const { app } = buildApp()
  return { app: app as unknown as Hono, db }
}

/**
 * Helper: makes a fetch against the app without a real server.
 * Equivalent to `app.fetch(new Request(...))` but more ergonomic.
 */
export async function apiFetch(
  app: Hono,
  path: string,
  init?: RequestInit & { body?: unknown },
): Promise<Response> {
  const url = `http://test${path.startsWith('/') ? path : `/${path}`}`
  const headers = new Headers(init?.headers)
  let body = init?.body
  if (body !== undefined && body !== null && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }
  return app.fetch(
    new Request(url, {
      method: init?.method ?? 'GET',
      headers,
      body: body as BodyInit | undefined,
    }),
  )
}
