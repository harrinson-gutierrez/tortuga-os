import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('proposals router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  function buildBody(opts: {
    clientId: string
    leadId?: string
    total?: number
    hours?: number
    milestonesCount?: number
    moduleHours?: number[]
  }) {
    const milestones = Array.from({ length: opts.milestonesCount ?? 1 }, (_, i) => ({
      num: i + 1,
      label: `Milestone ${i + 1}`,
      dueDate: 1_700_000_000_000 + i * 86_400_000,
      amountCents: Math.floor((opts.total ?? 100_000) / (opts.milestonesCount ?? 1)),
    }))
    // Make sure the sum matches exactly: adjust the last milestone.
    const sumSoFar = milestones.slice(0, -1).reduce((acc, m) => acc + m.amountCents, 0)
    if (milestones.length > 0) {
      milestones[milestones.length - 1]!.amountCents = (opts.total ?? 100_000) - sumSoFar
    }
    const modules = (opts.moduleHours ?? []).map((h, i) => ({
      key: `mod-${i + 1}`,
      label: `Module ${i + 1}`,
      estimateHours: h,
      needsDesign: false,
      taskTags: [],
    }))
    return {
      clientId: opts.clientId,
      leadId: opts.leadId,
      kind: 'commercial',
      currency: 'USD',
      totalAmountCents: opts.total ?? 100_000,
      contractedHours: opts.hours ?? 40,
      modules,
      milestones,
      members: [],
    }
  }

  it('GET /api/proposals on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/proposals')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST /api/proposals happy-path creates a draft with modules and returns the DTO', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const res = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({
        clientId: seeded.clientIds[0]!,
        total: 200_000,
        hours: 80,
        milestonesCount: 2,
        moduleHours: [40, 40],
      }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      status: string
      modules: unknown[]
      milestones: unknown[]
      totalAmountCents: number
    }
    expect(body.status).toBe('draft')
    expect(body.modules).toHaveLength(2)
    expect(body.milestones).toHaveLength(2)
    expect(body.totalAmountCents).toBe(200_000)
  })

  it('POST /api/proposals 400 when the milestone sum != total', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const body = buildBody({ clientId: seeded.clientIds[0]!, total: 100_000 })
    body.milestones[0]!.amountCents = 50_000 // breaks the balance
    const res = await apiFetch(ctx.app, '/api/proposals', { method: 'POST', body })
    expect(res.status).toBe(400)
  })

  it('POST /api/proposals 404 when clientId does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: 'c-nope' }),
    })
    expect(res.status).toBe(404)
  })

  it('POST /api/proposals 404 when leadId does not exist', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const res = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]!, leadId: 'l-nope' }),
    })
    expect(res.status).toBe(404)
  })

  it('GET /api/proposals/:id returns the proposal', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    const { id } = (await created.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/proposals/${id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; status: string }
    expect(body.id).toBe(id)
    expect(body.status).toBe('draft')
  })

  it('GET /api/proposals/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/proposals/nope')
    expect(res.status).toBe(404)
  })

  it('GET /api/proposals?client=ID filters by client', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 2 })
    await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[1]! }),
    })
    const res = await apiFetch(ctx.app, `/api/proposals?client=${seeded.clientIds[0]}`)
    const body = (await res.json()) as Array<{ clientId: string }>
    expect(body).toHaveLength(1)
    expect(body[0]!.clientId).toBe(seeded.clientIds[0])
  })

  it('PATCH /api/proposals/:id updates modules and total with the balance check', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    const { id } = (await created.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/proposals/${id}`, {
      method: 'PATCH',
      body: {
        totalAmountCents: 300_000,
        milestones: [
          {
            num: 1,
            label: 'Single milestone',
            dueDate: 1_700_000_000_000,
            amountCents: 300_000,
          },
        ],
      },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { totalAmountCents: number }
    expect(body.totalAmountCents).toBe(300_000)
  })

  it('POST /api/proposals/:id/transition draft → sent records a movement', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    const { id } = (await created.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'sent', reason: 'sent by email' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; sentAt: number | null }
    expect(body.status).toBe('sent')
    expect(body.sentAt).toBeGreaterThan(0)

    const movs = await apiFetch(ctx.app, `/api/proposals/${id}/movements`)
    const movsBody = (await movs.json()) as Array<{ fromStatus: string; toStatus: string }>
    expect(movsBody).toHaveLength(1)
    expect(movsBody[0]!.fromStatus).toBe('draft')
    expect(movsBody[0]!.toStatus).toBe('sent')
  })

  it('POST /api/proposals/:id/transition 422 on an illegal transition (draft → signed)', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    const { id } = (await created.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'signed' },
    })
    expect(res.status).toBe(422)
  })

  it('POST /api/proposals/:id/transition 400 when toStatus=instantiated (must use /instantiate)', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    const { id } = (await created.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
      method: 'POST',
      body: { toStatus: 'instantiated' },
    })
    expect(res.status).toBe(400)
  })

  it('DELETE /api/proposals/:id soft-deletes a draft', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: buildBody({ clientId: seeded.clientIds[0]! }),
    })
    const { id } = (await created.json()) as { id: string }
    const del = await apiFetch(ctx.app, `/api/proposals/${id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)
    const list = await apiFetch(ctx.app, '/api/proposals')
    expect(await list.json()).toEqual([])
  })

  it('DELETE /api/proposals/:id 404 when it does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/proposals/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})
