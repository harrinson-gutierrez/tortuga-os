import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
/**
 * DB helper for tests: in-memory SQLite with all migrations applied.
 *
 * Each test file calls `createTestDb()` in `beforeEach` (or in the first `it` if
 * it shares state inside the describe). Since vitest runs with `pool: 'forks'`,
 * each file has its own process and the singleton stays isolated.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { Db } from '../../packages/db/src/client'
import * as schema from '../../packages/db/src/schema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsPath = resolve(__dirname, '../../packages/db/migrations')

/** Creates an in-memory SQLite DB, applies migrations and returns the drizzle handle. */
export function createTestDb(): Db {
  const sqlite = new Database(':memory:')
  // Same pragmas as prod to avoid surprises from mode differences.
  sqlite.pragma('journal_mode = MEMORY')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = OFF')

  const db = drizzle(sqlite, { schema }) as Db
  migrate(db, { migrationsFolder: migrationsPath })
  return db
}

/** Closes the test DB (frees process memory, not strictly necessary). */
export function closeTestDb(db: Db): void {
  try {
    db.$client.close()
  } catch {
    // ignore — the worker process is going to die anyway
  }
}
