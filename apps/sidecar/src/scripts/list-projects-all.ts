import { projects } from '@tortuga-os/storage-sqlite'
import { getDb, initDb } from '../shared/db'

async function main() {
  await initDb()
  const db = getDb()
  const rows = await db.select().from(projects).all()
  for (const r of rows) {
    const deleted = r.deletedAt ? new Date(r.deletedAt).toISOString().slice(0, 10) : '—'
    console.log(`${r.code}\t${r.status}\tdeleted=${deleted}\t${r.name}`)
  }
  process.exit(0)
}
main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
