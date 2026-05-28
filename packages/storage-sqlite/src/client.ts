import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database
}

export interface CreateDbOptions {
  /** Absolute path to the .db file */
  dbPath: string
  /** Migrations folder (drizzle-kit `out`) */
  migrationsFolder?: string
  /** If true, run migrations on open */
  runMigrations?: boolean
}

/**
 * Opens (or creates) the SQLite DB at `dbPath`. Applies sensible pragmas and
 * optionally runs pending migrations.
 */
export async function createDb(opts: CreateDbOptions): Promise<Db> {
  await mkdir(dirname(opts.dbPath), { recursive: true })
  const sqlite = new Database(opts.dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('synchronous = NORMAL')

  const db = drizzle(sqlite, { schema }) as Db

  if (opts.runMigrations && opts.migrationsFolder) {
    migrate(db, { migrationsFolder: opts.migrationsFolder })
  }

  return db
}
