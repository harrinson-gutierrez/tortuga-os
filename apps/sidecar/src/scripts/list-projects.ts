import { projects } from '@tortuga-os/storage-sqlite'
import { isNull } from 'drizzle-orm'
import { getDb, initDb } from '../shared/db'

async function main() {
  await initDb()
  const db = getDb()
  const rows = await db
    .select({
      code: projects.code,
      name: projects.name,
      status: projects.status,
      description: projects.description,
      workspacePath: projects.workspacePath,
    })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .all()
  if (rows.length === 0) {
    console.log('(no projects)')
  } else {
    for (const r of rows) {
      console.log(`\n=== ${r.code} === ${r.name}`)
      console.log(`  status:    ${r.status}`)
      console.log(`  workspace: ${r.workspacePath ?? '-'}`)
      if (r.description) {
        const short = r.description.replace(/\s+/g, ' ').slice(0, 200)
        console.log(`  desc:      ${short}${r.description.length > 200 ? '...' : ''}`)
      }
    }
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('list-projects failed:', err.message ?? err)
  process.exit(1)
})
