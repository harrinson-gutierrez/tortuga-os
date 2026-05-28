import { asc, eq } from 'drizzle-orm'
// Agent-run time tracking: the synthetic "AI Agents" person, auto-logged
// time entries from agent runs, their inclusion in project margin, and the
// quoting-time attribution when a signed proposal is instantiated. We can't
// spawn Claude in CI, so we drive `ensureAgentPerson`/`logAgentRunTime`
// directly and fake `agent_runs` rows for the proposal path.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureAgentPerson,
  logAgentRunTime,
} from '../../apps/sidecar/src/modules/time-entries/agent-time'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { agentRuns, people, tasks, timeEntries } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedAgentDefinitions, seedMinimal } from '../helpers/test-seed'

describe('agent-run time tracking', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })
  afterEach(() => {
    resetDbForTests()
  })

  it('ensureAgentPerson() is idempotent and creates one "AI Agents" partner row', async () => {
    const id1 = await ensureAgentPerson()
    const id2 = await ensureAgentPerson()
    expect(id1).toBe('person-ai-agents')
    expect(id2).toBe('person-ai-agents')

    const rows = ctx.db.select().from(people).where(eq(people.id, 'person-ai-agents')).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('AI Agents')
    expect(rows[0]!.type).toBe('partner')
    expect(rows[0]!.defaultCostRateCents).toBe(1500)
  })

  it('logAgentRunTime() inserts one claude time entry, minutes = max(1, round(ms/60000))', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    await seedAgentDefinitions(ctx.db)
    const taskId = seeded.taskIds[0]!
    const t0 = 1_700_000_000_000

    for (const id of ['run-a', 'run-b']) {
      ctx.db
        .insert(agentRuns)
        .values({
          id,
          taskId,
          agentName: id === 'run-a' ? 'senior-dev' : 'qa-reviewer',
          status: 'success',
          startedAt: t0,
          finishedAt: t0 + 90_000,
          log: '',
        })
        .run()
    }

    await logAgentRunTime({
      taskId,
      agentRunId: 'run-a',
      agentName: 'senior-dev',
      startedAt: t0,
      finishedAt: t0 + 90_000, // → 2 min
    })
    await logAgentRunTime({
      taskId,
      agentRunId: 'run-b',
      agentName: 'qa-reviewer',
      startedAt: t0,
      finishedAt: t0 + 10_000, // → clamped to 1 min
    })

    const rows = ctx.db.select().from(timeEntries).where(eq(timeEntries.taskId, taskId)).all()
    expect(rows).toHaveLength(2)
    const byRun = new Map(rows.map((r) => [r.agentRunId, r]))
    const a = byRun.get('run-a')!
    expect(a.personId).toBe('person-ai-agents')
    expect(a.agentName).toBe('senior-dev')
    expect(a.source).toBe('claude')
    expect(Boolean(a.billable)).toBe(true)
    expect(a.minutes).toBe(2)
    expect(byRun.get('run-b')!.minutes).toBe(1)
  })

  it('logAgentRunTime() is a no-op when taskId is null/undefined', async () => {
    await logAgentRunTime({
      taskId: null,
      agentRunId: 'run-c',
      agentName: 'sales-rep',
      startedAt: 0,
      finishedAt: 60_000,
    })
    expect(ctx.db.select().from(timeEntries).all()).toHaveLength(0)
  })

  it('project margin includes agent-logged time at the AI person default rate', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1 })
    await ensureAgentPerson()
    const taskId = seeded.taskIds[0]!
    const projectId = seeded.projectIds[0]!

    ctx.db
      .insert(timeEntries)
      .values({
        id: 'te-agent-1',
        taskId,
        projectId,
        personId: 'person-ai-agents',
        agentName: 'senior-dev',
        source: 'claude',
        billable: true,
        minutes: 120,
        startedAt: Date.now(),
        createdAt: Date.now(),
      })
      .run()

    const res = await apiFetch(ctx.app, '/api/projects/TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      margin: { laborCostCents: number }
      hoursWorkedMinutes: number
    }
    expect(body.margin.laborCostCents).toBe(3000)
    expect(body.hoursWorkedMinutes).toBeGreaterThanOrEqual(120)
  })

  it('instantiate attributes sales-rep quoting time to the new project first task', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    await seedAgentDefinitions(ctx.db)
    const t0 = 1_700_000_000_000

    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: {
        clientId: seeded.clientIds[0]!,
        kind: 'commercial',
        currency: 'USD',
        projectCode: 'QT1',
        totalAmountCents: 100_000,
        contractedHours: 40,
        modules: [
          {
            key: 'core',
            label: 'Core module',
            estimateHours: 40,
            needsDesign: false,
            taskTags: ['backend'],
          },
        ],
        milestones: [{ num: 1, label: 'Kickoff', dueDate: t0, amountCents: 100_000 }],
        members: [],
      },
    })
    expect(created.status).toBe(201)
    const { id: proposalId } = (await created.json()) as { id: string }

    ctx.db
      .insert(agentRuns)
      .values({
        id: 'run-salesrep-1',
        taskId: null,
        agentName: 'sales-rep',
        status: 'success',
        startedAt: t0,
        finishedAt: t0 + 180_000, // → 3 min
        log: '',
        artifactsJson: JSON.stringify([{ kind: 'proposal-generation', proposalId }]),
      })
      .run()

    for (const toStatus of ['sent', 'negotiation', 'signed'] as const) {
      const r = await apiFetch(ctx.app, `/api/proposals/${proposalId}/transition`, {
        method: 'POST',
        body: { toStatus },
      })
      expect(r.status).toBe(200)
    }

    const inst = await apiFetch(ctx.app, `/api/proposals/${proposalId}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(inst.status).toBe(200)
    const { projectId } = (await inst.json()) as { projectId: string }

    const firstTask = ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.code))
      .get()
    expect(firstTask).toBeDefined()

    const entries = ctx.db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.taskId, firstTask!.id))
      .all()
    expect(entries).toHaveLength(1)
    expect(entries[0]!.agentName).toBe('sales-rep')
    expect(entries[0]!.source).toBe('claude')
    expect(entries[0]!.personId).toBe('person-ai-agents')
    expect(entries[0]!.minutes).toBe(3)
  })
})
