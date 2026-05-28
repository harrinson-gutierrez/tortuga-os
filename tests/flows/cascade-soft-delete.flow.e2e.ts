import { eq } from 'drizzle-orm'
/**
 * Flow: cascade soft-delete project → sprints + tasks + milestones.
 *
 * Transactional operation (`apps/sidecar/src/modules/projects/use-cases.ts`).
 * We validate:
 *   - happy path: every child row ends up with a non-null `deletedAt`
 *   - implicit rollback: once the transaction has committed there is no partial
 *     write (we can't easily force a failure here; we test atomicity by checking
 *     state consistency afterward)
 *   - the parent client is NOT deleted (no upward cascade)
 *   - the children become invisible to normal listings
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import {
  clients as clientsTable,
  milestones as milestonesTable,
  projects as projectsTable,
  sprints as sprintsTable,
  tasks as tasksTable,
} from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { attachTasksToSprint, seedMinimal } from '../helpers/test-seed'

describe('flow: cascade soft-delete project', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('deletes project + sprints + tasks + milestones, leaves the client alive', async () => {
    const s = await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1,
      sprints: 2,
      tasks: 3,
      milestones: 2,
    })
    const projectId = s.projectIds[0]!
    await attachTasksToSprint(ctx.db, s.taskIds, s.sprintIds[0]!)

    const del = await apiFetch(ctx.app, `/api/projects/${projectId}`, { method: 'DELETE' })
    expect(del.status).toBe(204)

    // Client alive
    const aliveClients = await ctx.db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, s.clientIds[0]!))
      .all()
    expect(aliveClients).toHaveLength(1)
    expect(aliveClients[0]!.deletedAt).toBeNull()

    // Project soft-deleted
    const projRow = await ctx.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .get()
    expect(projRow!.deletedAt).not.toBeNull()

    // Sprints soft-deleted
    const sprintRows = await ctx.db
      .select()
      .from(sprintsTable)
      .where(eq(sprintsTable.projectId, projectId))
      .all()
    expect(sprintRows).toHaveLength(2)
    expect(sprintRows.every((r) => r.deletedAt !== null)).toBe(true)

    // Tasks soft-deleted
    const taskRows = await ctx.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.projectId, projectId))
      .all()
    expect(taskRows).toHaveLength(3)
    expect(taskRows.every((r) => r.deletedAt !== null)).toBe(true)

    // Milestones soft-deleted
    const msRows = await ctx.db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.projectId, projectId))
      .all()
    expect(msRows).toHaveLength(2)
    expect(msRows.every((r) => r.deletedAt !== null)).toBe(true)
  })

  it('public listings show no child of the deleted project', async () => {
    const s = await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1,
      sprints: 1,
      tasks: 2,
      milestones: 1,
    })
    await apiFetch(ctx.app, `/api/projects/${s.projectIds[0]}`, { method: 'DELETE' })

    expect(await (await apiFetch(ctx.app, '/api/projects')).json()).toEqual([])
    expect(await (await apiFetch(ctx.app, '/api/sprints')).json()).toEqual([])
    expect(await (await apiFetch(ctx.app, '/api/tasks')).json()).toEqual([])
    expect(await (await apiFetch(ctx.app, '/api/milestones')).json()).toEqual([])

    // Client is still listed
    const clients = (await (await apiFetch(ctx.app, '/api/clients')).json()) as unknown[]
    expect(clients).toHaveLength(1)
  })

  it('deleting a project does NOT affect the children of another project of the same client', async () => {
    const s = await seedMinimal(ctx.db, {
      clients: 1,
      projects: 2,
      sprints: 1,
      tasks: 2,
      milestones: 1,
    })

    await apiFetch(ctx.app, `/api/projects/${s.projectIds[0]}`, { method: 'DELETE' })

    // Listings must show only those of the live project
    const sprintsList = (await (await apiFetch(ctx.app, '/api/sprints')).json()) as Array<{
      projectId: string
    }>
    expect(sprintsList).toHaveLength(1)
    expect(sprintsList[0]!.projectId).toBe(s.projectIds[1])

    const tasksList = (await (await apiFetch(ctx.app, '/api/tasks')).json()) as Array<{
      projectId: string
    }>
    expect(tasksList).toHaveLength(2)
    expect(tasksList.every((t) => t.projectId === s.projectIds[1])).toBe(true)
  })

  it('a deleted sprint only unlinks tasks (does not delete them)', async () => {
    const s = await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1,
      sprints: 1,
      tasks: 2,
    })
    await attachTasksToSprint(ctx.db, s.taskIds, s.sprintIds[0]!)

    const del = await apiFetch(ctx.app, `/api/sprints/${s.sprintIds[0]}`, {
      method: 'DELETE',
    })
    expect(del.status).toBe(204)

    // Tasks alive with sprintId = null
    const taskRows = await ctx.db.select().from(tasksTable).all()
    expect(taskRows).toHaveLength(2)
    expect(taskRows.every((t) => t.deletedAt === null)).toBe(true)
    expect(taskRows.every((t) => t.sprintId === null)).toBe(true)
  })
})
