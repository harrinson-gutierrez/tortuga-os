import { eq } from 'drizzle-orm'
/**
 * Flow: signed proposal → instantiate → operational project.
 *
 * Atomic operation that touches proposals + projects + milestones +
 * project_member_rates + sprints + tasks + leads + lead_movements +
 * proposal_movements. It is the most complex flow of the product.
 *
 * We validate:
 *   - happy path: everything created consistently
 *   - 422 when the proposal is not in `signed`
 *   - 400 when projectCode is missing and the proposal has none
 *   - rollback on a duplicate projectCode
 *   - the associated lead moves to `instantiated` with an audit entry
 *   - a second /instantiate call on the same proposal fails (no longer signed)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import {
  leadMovements as leadMovementsTable,
  leads as leadsTable,
  projects as projectsTable,
} from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('flow: instantiate project from signed proposal', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  function buildProposalBody(clientId: string, leadId?: string) {
    return {
      clientId,
      leadId,
      kind: 'commercial',
      currency: 'USD',
      projectCode: 'NEW1',
      totalAmountCents: 200_000,
      contractedHours: 80,
      modules: [
        {
          key: 'stripe',
          label: 'Stripe integration',
          estimateHours: 40,
          needsDesign: false,
          taskTags: ['backend'],
        },
        {
          key: 'admin',
          label: 'Billing admin',
          estimateHours: 40,
          needsDesign: true,
          taskTags: ['frontend'],
        },
      ],
      milestones: [
        {
          num: 1,
          label: 'Kickoff',
          dueDate: 1_700_000_000_000,
          amountCents: 100_000,
        },
        {
          num: 2,
          label: 'Delivery',
          dueDate: 1_701_000_000_000,
          amountCents: 100_000,
        },
      ],
      members: [],
    }
  }

  async function createAndSign(clientId: string, leadId?: string) {
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildProposalBody(clientId, leadId),
    })
    const { id } = (await created.json()) as { id: string }
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'sent' },
    })
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'negotiation' },
    })
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'signed' },
    })
    return id
  }

  it('happy path: signed → instantiate creates project + milestones + tasks + sprint', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const proposalId = await createAndSign(seeded.clientIds[0]!)

    const res = await apiFetch(ctx.app, `/api/proposals/${proposalId}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      proposal: { status: string; instantiatedProjectId: string }
      projectId: string
      projectCode: string
    }
    expect(body.proposal.status).toBe('instantiated')
    expect(body.projectCode).toBe('NEW1')
    expect(body.proposal.instantiatedProjectId).toBe(body.projectId)

    // Project created with hours/amount, starts in `design_pending`
    const proj = await apiFetch(ctx.app, '/api/projects/NEW1')
    expect(proj.status).toBe(200)
    const projBody = (await proj.json()) as {
      project: { contractedAmountCents: number; contractedHours: number; status: string }
      milestones: unknown[]
      activeSprint: { num: number } | null
    }
    expect(projBody.project.contractedAmountCents).toBe(200_000)
    expect(projBody.project.contractedHours).toBe(80)
    expect(projBody.project.status).toBe('design_pending')
    expect(projBody.milestones).toHaveLength(2)

    // One discovery task for design-architect — module tasks are NOT created
    // until the human approves the design and moves the project to dev_ready
    const tasks = await apiFetch(ctx.app, '/api/tasks?project=NEW1')
    const tasksBody = (await tasks.json()) as Array<{
      code: string
      title: string
      status: string
      kind: string
      needsDesign: boolean
    }>
    expect(tasksBody).toHaveLength(1)
    expect(tasksBody[0]!.code).toBe('T-000')
    expect(tasksBody[0]!.kind).toBe('discovery')
    expect(tasksBody[0]!.status).toBe('backlog')

    // Sprint 1 created in planned
    const sprints = await apiFetch(ctx.app, '/api/sprints?project=NEW1')
    const sprintsBody = (await sprints.json()) as Array<{
      num: number
      status: string
    }>
    expect(sprintsBody).toHaveLength(1)
    expect(sprintsBody[0]!.num).toBe(1)
    expect(sprintsBody[0]!.status).toBe('planned')
  })

  it('moves the associated lead to instantiated and leaves an audit in lead_movements', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, leads: 1 })
    // Advance the lead to `signed` before signing the proposal (realistic parallel)
    await apiFetch(ctx.app, `/api/leads/${seeded.leadIds[0]}`, {
      method: 'PATCH',
      body: { currentStage: 'signed' },
    })
    const proposalId = await createAndSign(seeded.clientIds[0]!, seeded.leadIds[0]!)

    const res = await apiFetch(ctx.app, `/api/proposals/${proposalId}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(200)

    // Lead advanced to instantiated
    const leadRow = await ctx.db
      .select()
      .from(leadsTable)
      .where(eq(leadsTable.id, seeded.leadIds[0]!))
      .get()
    expect(leadRow!.currentStage).toBe('instantiated')
    expect(leadRow!.proposalId).toBe(proposalId)

    // Audit: at least 2 movements (lead→signed and signed→instantiated)
    const movs = await ctx.db
      .select()
      .from(leadMovementsTable)
      .where(eq(leadMovementsTable.leadId, seeded.leadIds[0]!))
      .all()
    const stages = movs.map((m) => `${m.fromStage}→${m.toStage}`)
    expect(stages).toContain('signed→instantiated')
  })

  it('422 when the proposal is not in signed (draft / sent / negotiation)', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildProposalBody(seeded.clientIds[0]!),
    })
    const { id } = (await created.json()) as { id: string }

    const res = await apiFetch(ctx.app, `/api/proposals/${id}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(422)
  })

  it('400 when projectCode is missing and the proposal has none', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    // Create without projectCode
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: {
        ...buildProposalBody(seeded.clientIds[0]!),
        projectCode: undefined,
      },
    })
    const { id } = (await created.json()) as { id: string }
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'sent' },
    })
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'negotiation' },
    })
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'signed' },
    })

    const res = await apiFetch(ctx.app, `/api/proposals/${id}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(400)
  })

  it('rollback on a duplicate projectCode: no project created', async () => {
    const seeded = await seedMinimal(ctx.db, {
      clients: 1,
      projects: 1, // creates project p-001 with code TST1
    })
    // Proposal that tries to use TST1 (already taken)
    const body = buildProposalBody(seeded.clientIds[0]!)
    body.projectCode = 'TST1'
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body,
    })
    const { id } = (await created.json()) as { id: string }
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'sent' },
    })
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'negotiation' },
    })
    await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'signed' },
    })

    const res = await apiFetch(ctx.app, `/api/proposals/${id}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(res.status).toBe(400)

    // Live projects = only the original seeded one (no new one created)
    const projsList = await apiFetch(ctx.app, '/api/projects')
    const projsBody = (await projsList.json()) as Array<{ code: string }>
    expect(projsBody).toHaveLength(1)
    expect(projsBody[0]!.code).toBe('TST1')

    // The proposal is still in signed (did not advance to instantiated)
    const prop = await apiFetch(ctx.app, `/api/proposals/${id}`)
    const propBody = (await prop.json()) as { status: string }
    expect(propBody.status).toBe('signed')
  })

  it('idempotency: a second call fails because it is already instantiated', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const id = await createAndSign(seeded.clientIds[0]!)

    const first = await apiFetch(ctx.app, `/api/proposals/${id}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(first.status).toBe(200)

    const second = await apiFetch(ctx.app, `/api/proposals/${id}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(second.status).toBe(422)
  })
})
