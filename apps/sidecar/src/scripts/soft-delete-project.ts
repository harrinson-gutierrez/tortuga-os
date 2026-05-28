/**
 * One-shot: mark a project as deletedAt with a reason note in the
 * description (preserved for posterity). Use when the project's scope
 * has been absorbed into another (Tortuga itself, in ACM's case) and
 * we want it out of the active portfolio.
 *
 * The workspace folder on disk is NOT touched — you can still browse
 * it under tortuga-projects/<CODE>/ if you ever want to revisit.
 *
 * Usage (PowerShell):
 *   $env:TORTUGA_DATA_DIR = "$env:APPDATA\co.tortuga.os"
 *   pnpm --filter @tortuga/sidecar exec tsx \
 *     src/scripts/soft-delete-project.ts <CODE> "<reason>"
 */
import { projects } from '@tortuga-os/storage-sqlite'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb, initDb } from '../shared/db'

async function main() {
  const code = process.argv[2]
  const reason = process.argv[3] ?? ''
  if (!code || !reason) {
    console.error('Usage: tsx soft-delete-project.ts <PROJECT_CODE> "<reason>"')
    process.exit(2)
  }
  await initDb()
  const db = getDb()
  const project = await db
    .select()
    .from(projects)
    .where(and(eq(projects.code, code), isNull(projects.deletedAt)))
    .get()
  if (!project) throw new Error(`Project ${code} not found (or already deleted)`)
  const now = Date.now()
  const note = `[archived ${new Date(now).toISOString().slice(0, 10)}] ${reason}\n\n---\n\n${project.description ?? ''}`
  await db
    .update(projects)
    .set({ deletedAt: now, description: note, updatedAt: now })
    .where(eq(projects.id, project.id))
  console.log(`✓ Project ${code} soft-deleted (deletedAt=${now})`)
  console.log(`  Reason: ${reason}`)
  console.log(`  Workspace folder on disk untouched: ${project.workspacePath ?? '(none)'}`)
  process.exit(0)
}

main().catch((err) => {
  console.error('soft-delete-project failed:', err.message ?? err)
  process.exit(1)
})
