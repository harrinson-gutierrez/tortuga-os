import { type Db, createDb } from '@tortuga-os/storage-sqlite'
import { dbPath, env, migrationsPath } from './env'
import { logger } from './logger'

let _db: Db | null = null

export async function initDb(): Promise<Db> {
  if (_db) return _db
  logger.info({ dbPath, dataDir: env.dataDir }, 'Initializing SQLite')
  _db = await createDb({
    dbPath,
    migrationsFolder: migrationsPath,
    runMigrations: true,
  })
  logger.info('SQLite ready')
  return _db
}

export function getDb(): Db {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.')
  return _db
}

/**
 * Test-only: inject an in-memory DB built from a test.
 * Replaces the singleton without opening the real file. Use ONLY from
 * `tests/helpers/test-app.ts`. NEVER call from production code.
 */
export function setDbForTests(db: Db): void {
  _db = db
}

/**
 * Test-only: clear the singleton between tests if needed.
 */
export function resetDbForTests(): void {
  _db = null
}
