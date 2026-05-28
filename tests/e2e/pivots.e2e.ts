import { eq } from 'drizzle-orm'
// Project pivots: when the user pivots the stack of a live project, the
// pivot-architect's plan can kill/rewrite/create tasks and archive 04-repos/.
// We don't spawn Claude in CI; we insert a project_pivots row with a known
// proposal and exercise the accept/reject endpoints directly.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import {
  projectPivots,
  projects as projectsTable,
  tasks as tasksTable,
} from '../../packages/db/src/schema'
import type { PivotProposalDTO } from '../../packages/shared-types/src/dtos'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('project pivots', () => {
  let ctx: TestApp
  beforeEach(() => {
    ctx = buildTestApp()
  })
  afterEach(() => {
    resetDbForTests()
  })

  function seedPivot(
    projectId: string,
    proposal: PivotProposalDTO,
    status: 'proposed' | 'accepted' | 'rejected' = 'proposed',
  ) {
    const id = `piv-${Math.random().toString(36).slice(2, 8)}`
    ctx.db
      .insert(projectPivots)
      .values({
        id,
        projectId,
        triggeredBy: 'human',
        reason: 'test',
        fromStackSummary: proposal.fromStackSummary,
        toStackSummary: proposal.toStackSummary,
        proposalJson: JSON.stringify(proposal),
        status,
      })
      .run()
    return id
  }

  it('GET /api/pivots/by-project/:code lists pivots ordered by date desc', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    seedPivot(s.projectIds[0]!, { ...emptyProposal(), fromStackSummary: 'A', toStackSummary: 'B' })
    seedPivot(s.projectIds[0]!, { ...emptyProposal(), fromStackSummary: 'C', toStackSummary: 'D' })
    const res = await apiFetch(ctx.app, '/api/pivots/by-project/TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{ fromStackSummary: string }>
    expect(body).toHaveLength(2)
  })

  it('accept: kills selected tasks, rewrites others, creates new ones, marks pivot accepted', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 3 })
    const proposal: PivotProposalDTO = {
      fromStackSummary: 'React + Hono',
      toStackSummary: 'Flutter + Supabase',
      tasksToKill: [{ taskId: s.taskIds[0]!, reason: 'backend replaced' }],
      tasksToRewrite: [
        {
          taskId: s.taskIds[1]!,
          newTitle: 'Login Flutter (Supabase Auth)',
          newDescription: 'Rewritten for Supabase Auth',
          newEstimateHours: 6,
        },
      ],
      tasksToCreate: [
        { title: 'Setup Supabase + RLS', kind: 'feature', tags: ['infra'], estimateHours: 4 },
      ],
      tasksToKeep: [s.taskIds[2]!],
      archiveDecision: 'archive',
      risksAndMitigations: [],
      clientImpactNote: '',
    }
    const pivotId = seedPivot(s.projectIds[0]!, proposal)

    const res = await apiFetch(ctx.app, `/api/pivots/${pivotId}/accept`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      status: string
      archivedTaskIds: string[]
      rewrittenTaskIds: string[]
      newTaskIds: string[]
    }
    expect(body.status).toBe('accepted')
    expect(body.archivedTaskIds).toEqual([s.taskIds[0]!])
    expect(body.rewrittenTaskIds).toEqual([s.taskIds[1]!])
    expect(body.newTaskIds).toHaveLength(1)

    // Killed task is done + obsoletedByPivotId set
    const killed = await ctx.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, s.taskIds[0]!))
      .get()
    expect(killed!.status).toBe('done')
    expect(killed!.obsoletedByPivotId).toBe(pivotId)

    // Rewritten task got the new title + estimate
    const rew = await ctx.db.select().from(tasksTable).where(eq(tasksTable.id, s.taskIds[1]!)).get()
    expect(rew!.title).toBe('Login Flutter (Supabase Auth)')
    expect(rew!.estimateMinutes).toBe(6 * 60)

    // Untouched task stayed
    const keep = await ctx.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, s.taskIds[2]!))
      .get()
    expect(keep!.obsoletedByPivotId).toBeNull()

    // The new task exists in backlog
    const newTask = await ctx.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, body.newTaskIds[0]!))
      .get()
    expect(newTask!.status).toBe('backlog')
    expect(newTask!.title).toBe('Setup Supabase + RLS')
  })

  it('accept honors overrides (skip a kill, skip a create)', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2 })
    const proposal: PivotProposalDTO = {
      ...emptyProposal(),
      tasksToKill: [
        { taskId: s.taskIds[0]!, reason: 'X' },
        { taskId: s.taskIds[1]!, reason: 'Y' },
      ],
      tasksToCreate: [
        { title: 'A', kind: 'feature', tags: [] },
        { title: 'B', kind: 'feature', tags: [] },
      ],
    }
    const pivotId = seedPivot(s.projectIds[0]!, proposal)
    const res = await apiFetch(ctx.app, `/api/pivots/${pivotId}/accept`, {
      method: 'POST',
      body: { killTaskIds: [s.taskIds[0]!], createIndexes: [1] },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { archivedTaskIds: string[]; newTaskIds: string[] }
    expect(body.archivedTaskIds).toEqual([s.taskIds[0]!])
    expect(body.newTaskIds).toHaveLength(1)
    const created = await ctx.db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.id, body.newTaskIds[0]!))
      .get()
    expect(created!.title).toBe('B')
    // The second kill was skipped — task 2 stays untouched.
    const t2 = await ctx.db.select().from(tasksTable).where(eq(tasksTable.id, s.taskIds[1]!)).get()
    expect(t2!.obsoletedByPivotId).toBeNull()
  })

  it('cannot accept a pivot that is already accepted or rejected', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const pivotId = seedPivot(s.projectIds[0]!, emptyProposal(), 'accepted')
    const res = await apiFetch(ctx.app, `/api/pivots/${pivotId}/accept`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(422)
  })

  it('reject marks the pivot rejected and changes nothing else', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    const proposal: PivotProposalDTO = {
      ...emptyProposal(),
      tasksToKill: [{ taskId: s.taskIds[0]!, reason: 'no' }],
    }
    const pivotId = seedPivot(s.projectIds[0]!, proposal)
    const res = await apiFetch(ctx.app, `/api/pivots/${pivotId}/reject`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe('rejected')
    const t = await ctx.db.select().from(tasksTable).where(eq(tasksTable.id, s.taskIds[0]!)).get()
    expect(t!.status).toBe('backlog')
    expect(t!.obsoletedByPivotId).toBeNull()
  })

  it('accept updates projects.currentStack with the pivot toStackSummary', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const proposal: PivotProposalDTO = {
      ...emptyProposal(),
      fromStackSummary: 'React + Hono',
      toStackSummary: 'Flutter + Supabase (Auth + Postgres with RLS)',
    }
    const pivotId = seedPivot(s.projectIds[0]!, proposal)
    const before = await ctx.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, s.projectIds[0]!))
      .get()
    expect(before!.currentStack).toBeNull()

    const res = await apiFetch(ctx.app, `/api/pivots/${pivotId}/accept`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)
    const after = await ctx.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, s.projectIds[0]!))
      .get()
    expect(after!.currentStack).toBe('Flutter + Supabase (Auth + Postgres with RLS)')
  })

  it('done tasks are never touched by accept, even if proposed for kill', async () => {
    const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    ctx.db
      .update(tasksTable)
      .set({ status: 'done', updatedAt: Date.now() })
      .where(eq(tasksTable.id, s.taskIds[0]!))
      .run()
    const proposal: PivotProposalDTO = {
      ...emptyProposal(),
      tasksToKill: [{ taskId: s.taskIds[0]!, reason: 'x' }],
    }
    const pivotId = seedPivot(s.projectIds[0]!, proposal)
    const res = await apiFetch(ctx.app, `/api/pivots/${pivotId}/accept`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)
    const t = await ctx.db.select().from(tasksTable).where(eq(tasksTable.id, s.taskIds[0]!)).get()
    expect(t!.obsoletedByPivotId).toBeNull() // never marked
  })
})

function emptyProposal(): PivotProposalDTO {
  return {
    fromStackSummary: '',
    toStackSummary: '',
    tasksToKill: [],
    tasksToRewrite: [],
    tasksToCreate: [],
    tasksToKeep: [],
    archiveDecision: 'archive',
    risksAndMitigations: [],
    clientImpactNote: '',
  }
}
