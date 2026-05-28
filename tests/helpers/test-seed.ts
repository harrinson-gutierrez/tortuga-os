import type { Db } from '../../packages/db/src/client'
/**
 * Deterministic seed for tests. Different from the synthetic seed in
 * `apps/sidecar/src/seed/`, which is meant for manual dev and loads 18 tasks +
 * 4 leads + ~30 time_entries.
 *
 * Here the counts are knobs: each test asks for exactly what it needs. IDs are
 * predictable strings (`c-001`, `p-001`, ...) so assertions stay stable.
 */
import {
  agentDefinitions,
  clients,
  leads,
  milestones,
  people,
  projectMemberRates,
  projects,
  sprints,
  tasks,
} from '../../packages/db/src/schema'

export interface SeedKnobs {
  clients?: number
  projects?: number // if > 0, requires clients > 0
  people?: number
  sprints?: number // per project
  tasks?: number // per project
  milestones?: number // per project
  leads?: number
}

const pad = (n: number) => String(n).padStart(3, '0')

/**
 * Inserts minimal rows. Returns the seeded IDs for use in assertions.
 *
 * Usage:
 *   const seeded = await seedMinimal(db, { clients: 1, projects: 2, tasks: 3 })
 *   expect(seeded.clientIds).toEqual(['c-001'])
 */
export async function seedMinimal(db: Db, knobs: SeedKnobs = {}) {
  const now = 1_700_000_000_000 // fixed epoch ms: 2023-11-14, avoids flaky Date.now()

  const clientIds: string[] = []
  const projectIds: string[] = []
  const personIds: string[] = []
  const sprintIds: string[] = []
  const taskIds: string[] = []
  const milestoneIds: string[] = []
  const leadIds: string[] = []

  for (let i = 1; i <= (knobs.clients ?? 0); i++) {
    const id = `c-${pad(i)}`
    clientIds.push(id)
    await db.insert(clients).values({
      id,
      name: `Test Client ${i}`,
      taxId: `NIT-${pad(i)}`,
      contactEmail: `client${i}@test.local`,
      createdAt: now,
      updatedAt: now,
    })
  }

  for (let i = 1; i <= (knobs.people ?? 0); i++) {
    const id = `pe-${pad(i)}`
    personIds.push(id)
    await db.insert(people).values({
      id,
      name: `Test Person ${i}`,
      email: `person${i}@test.local`,
      role: 'Engineer',
      type: i === 1 ? 'internal' : 'partner',
      defaultCostRateCents: 5000 * i, // 50/hr, 100/hr, ...
      createdAt: now,
    })
  }

  // Projects (require client[0])
  if ((knobs.projects ?? 0) > 0 && clientIds.length === 0) {
    throw new Error('seedMinimal: projects > 0 requires clients > 0')
  }
  for (let i = 1; i <= (knobs.projects ?? 0); i++) {
    const id = `p-${pad(i)}`
    projectIds.push(id)
    await db.insert(projects).values({
      id,
      clientId: clientIds[0]!,
      code: `TST${i}`,
      name: `Test Project ${i}`,
      description: `Synthetic test project ${i}`,
      status: 'active',
      currency: 'USD',
      contractedAmountCents: 100_000 * i, // $1000, $2000
      contractedHours: 40 * i,
      repoPathsJson: '[]',
      startDate: now,
      endDate: now + 30 * 24 * 60 * 60 * 1000,
      createdAt: now,
      updatedAt: now,
    })
  }

  for (const pid of projectIds) {
    for (let s = 1; s <= (knobs.sprints ?? 0); s++) {
      const id = `s-${pid}-${pad(s)}`
      sprintIds.push(id)
      await db.insert(sprints).values({
        id,
        projectId: pid,
        num: s,
        goal: `Sprint ${s} goal`,
        startDate: now,
        endDate: now + 14 * 24 * 60 * 60 * 1000,
        status: s === 1 ? 'active' : 'planned',
        createdAt: now,
      })
    }
  }

  for (const pid of projectIds) {
    for (let t = 1; t <= (knobs.tasks ?? 0); t++) {
      const id = `t-${pid}-${pad(t)}`
      taskIds.push(id)
      await db.insert(tasks).values({
        id,
        projectId: pid,
        code: `T-${pad(t)}`,
        title: `Task ${t}`,
        description: `Description of task ${t}`,
        status: 'backlog',
        priority: 'med',
        tagsJson: '[]',
        needsDesign: false,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  for (const pid of projectIds) {
    for (let m = 1; m <= (knobs.milestones ?? 0); m++) {
      const id = `m-${pid}-${pad(m)}`
      milestoneIds.push(id)
      await db.insert(milestones).values({
        id,
        projectId: pid,
        num: m,
        label: `Milestone ${m}`,
        dueDate: now + m * 7 * 24 * 60 * 60 * 1000,
        amountCents: 50_000,
        status: 'pending',
        createdAt: now,
      })
    }
  }

  for (let i = 1; i <= (knobs.leads ?? 0); i++) {
    const id = `l-${pad(i)}`
    leadIds.push(id)
    await db.insert(leads).values({
      id,
      contactName: `Lead Contact ${i}`,
      contactEmail: `lead${i}@test.local`,
      company: `Lead Company ${i}`,
      currentStage: 'lead',
      createdAt: now,
      updatedAt: now,
    })
  }

  return {
    now,
    clientIds,
    projectIds,
    personIds,
    sprintIds,
    taskIds,
    milestoneIds,
    leadIds,
  }
}

/**
 * Inserts the 6 deterministic agents that watch each kanban column, matching the
 * real names and `watches` columns of the production flow. Useful for kanban
 * tests (board, claimable, movements) that depend on the column→agent map.
 */
export async function seedAgentDefinitions(db: Db) {
  const now = 1_700_000_000_000
  const defs = [
    { name: 'design-architect', watches: 'backlog', signoff: false },
    { name: 'senior-dev', watches: 'design_ready', signoff: false },
    { name: 'qa-reviewer', watches: 'dev_ready', signoff: false },
    { name: 'security-reviewer', watches: 'qa_ready', signoff: true },
    { name: 'delivery-validator', watches: 'security_ready', signoff: true },
    { name: 'sales-rep', watches: 'leads', signoff: true },
  ] as const
  for (const d of defs) {
    await db.insert(agentDefinitions).values({
      name: d.name,
      description: `${d.name} test fixture`,
      model: 'claude-sonnet-4-6',
      watchesColumn: d.watches,
      toolsJson: '[]',
      allowedPathsJson: '[]',
      requiresHumanSignoff: d.signoff,
      systemPrompt: `system prompt of ${d.name}`,
      loadedAt: now,
      fileHash: 'test-fixture',
    })
  }
}

/**
 * Attaches existing tasks to a sprint (helper for tests that need that link
 * without going through the endpoint).
 */
export async function attachTasksToSprint(db: Db, taskIds: string[], sprintId: string) {
  const { eq } = await import('drizzle-orm')
  for (const tid of taskIds) {
    await db.update(tasks).set({ sprintId }).where(eq(tasks.id, tid))
  }
}
