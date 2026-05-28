import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('time-entries router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  async function seedFull() {
    return seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 1, people: 1 })
  }

  async function logOne(taskId: string, personId: string, minutes: number) {
    return apiFetch(ctx.app, '/api/time-entries', {
      method: 'POST',
      body: {
        taskId,
        personId,
        startedAt: 1_700_000_000_000,
        minutes,
      },
    })
  }

  it('GET /api/time-entries returns an empty list on a fresh DB', async () => {
    const res = await apiFetch(ctx.app, '/api/time-entries')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST /api/time-entries creates an entry with defaults (manual, billable)', async () => {
    const s = await seedFull()
    const res = await logOne(s.taskIds[0]!, s.personIds[0]!, 60)
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      minutes: number
      source: string
      billable: number | boolean
    }
    expect(body.minutes).toBe(60)
    expect(body.source).toBe('manual')
    // SQLite returns booleans as 0/1
    expect(Boolean(body.billable)).toBe(true)
  })

  it('POST /api/time-entries 404 when the task does not exist', async () => {
    const s = await seedFull()
    const res = await apiFetch(ctx.app, '/api/time-entries', {
      method: 'POST',
      body: {
        taskId: 't-nonexistent',
        personId: s.personIds[0],
        startedAt: 1_700_000_000_000,
        minutes: 30,
      },
    })
    expect(res.status).toBe(404)
  })

  it('POST /api/time-entries 400 when minutes is not positive', async () => {
    const s = await seedFull()
    const res = await apiFetch(ctx.app, '/api/time-entries', {
      method: 'POST',
      body: {
        taskId: s.taskIds[0],
        personId: s.personIds[0],
        startedAt: 1_700_000_000_000,
        minutes: 0,
      },
    })
    expect(res.status).toBe(400)
  })

  it('GET /api/time-entries?task=ID filters by task', async () => {
    const s = await seedFull()
    await logOne(s.taskIds[0]!, s.personIds[0]!, 30)
    await logOne(s.taskIds[0]!, s.personIds[0]!, 45)

    const res = await apiFetch(ctx.app, `/api/time-entries?task=${s.taskIds[0]}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as unknown[]
    expect(body).toHaveLength(2)
  })

  it('GET /api/time-entries?project=CODE returns entries with task code/title + person name', async () => {
    const s = await seedFull()
    await logOne(s.taskIds[0]!, s.personIds[0]!, 30)
    await logOne(s.taskIds[0]!, s.personIds[0]!, 45)

    const res = await apiFetch(ctx.app, '/api/time-entries?project=TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      taskCode: string
      taskTitle: string
      personName: string | null
      minutes: number
      source: string
    }>
    expect(body).toHaveLength(2)
    expect(body[0]!.taskCode).toBeTruthy()
    expect(body[0]!.taskTitle).toBeTruthy()
    expect(body[0]!.personName).toBeTruthy()
    expect(body.reduce((a, e) => a + e.minutes, 0)).toBe(75)

    const nope = await apiFetch(ctx.app, '/api/time-entries?project=NOPE')
    expect(nope.status).toBe(404)
  })

  it('GET /api/time-entries/:id returns the entry', async () => {
    const s = await seedFull()
    const created = await logOne(s.taskIds[0]!, s.personIds[0]!, 60)
    const { id } = (await created.json()) as { id: string }

    const res = await apiFetch(ctx.app, `/api/time-entries/${id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { minutes: number }
    expect(body.minutes).toBe(60)
  })

  it('GET /api/time-entries/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/time-entries/nope')
    expect(res.status).toBe(404)
  })

  it('PATCH /api/time-entries/:id updates minutes and note', async () => {
    const s = await seedFull()
    const created = await logOne(s.taskIds[0]!, s.personIds[0]!, 60)
    const { id } = (await created.json()) as { id: string }

    const res = await apiFetch(ctx.app, `/api/time-entries/${id}`, {
      method: 'PATCH',
      body: { minutes: 90, note: 'Adjusted' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { minutes: number; note: string }
    expect(body.minutes).toBe(90)
    expect(body.note).toBe('Adjusted')
  })

  it('PATCH /api/time-entries/:id 400 on an unknown field', async () => {
    const s = await seedFull()
    const created = await logOne(s.taskIds[0]!, s.personIds[0]!, 60)
    const { id } = (await created.json()) as { id: string }

    const res = await apiFetch(ctx.app, `/api/time-entries/${id}`, {
      method: 'PATCH',
      body: { foo: 'bar' },
    })
    expect(res.status).toBe(400)
  })

  it('DELETE /api/time-entries/:id soft-deletes', async () => {
    const s = await seedFull()
    const created = await logOne(s.taskIds[0]!, s.personIds[0]!, 60)
    const { id } = (await created.json()) as { id: string }

    const del = await apiFetch(ctx.app, `/api/time-entries/${id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/time-entries')
    expect(await list.json()).toEqual([])
  })

  it('DELETE /api/time-entries/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/time-entries/nope', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  describe('manual stopwatch', () => {
    it('GET /api/time-entries/active returns null when nothing is running', async () => {
      const res = await apiFetch(ctx.app, '/api/time-entries/active')
      expect(res.status).toBe(200)
      expect(await res.json()).toBeNull()
    })

    it('POST /api/time-entries/start starts a stopwatch (endedAt null, minutes 0)', async () => {
      const s = await seedFull()
      const res = await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: s.taskIds[0] },
      })
      expect(res.status).toBe(201)
      const body = (await res.json()) as {
        id: string
        endedAt: number | null
        minutes: number
        source: string
      }
      expect(body.endedAt).toBeNull()
      expect(body.minutes).toBe(0)
      expect(body.source).toBe('manual')

      const active = await apiFetch(ctx.app, '/api/time-entries/active')
      const a = (await active.json()) as { id: string } | null
      expect(a?.id).toBe(body.id)
    })

    it('POST /api/time-entries/start 404 when the task does not exist', async () => {
      await seedFull()
      const res = await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: 't-nope' },
      })
      expect(res.status).toBe(404)
    })

    it('POST /api/time-entries/start 409 when another one is already running', async () => {
      const s = await seedFull()
      await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: s.taskIds[0] },
      })
      const res = await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: s.taskIds[0] },
      })
      expect(res.status).toBe(409)
    })

    it('POST /api/time-entries/:id/stop stops the stopwatch (minutes >= 1)', async () => {
      const s = await seedFull()
      const started = await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: s.taskIds[0] },
      })
      const { id } = (await started.json()) as { id: string }

      const stopped = await apiFetch(ctx.app, `/api/time-entries/${id}/stop`, { method: 'POST' })
      expect(stopped.status).toBe(200)
      const body = (await stopped.json()) as { endedAt: number | null; minutes: number }
      expect(body.endedAt).not.toBeNull()
      expect(body.minutes).toBeGreaterThanOrEqual(1)

      // idempotente
      const again = await apiFetch(ctx.app, `/api/time-entries/${id}/stop`, { method: 'POST' })
      expect(again.status).toBe(200)

      // ya no hay activo, y se puede arrancar otro
      expect(await (await apiFetch(ctx.app, '/api/time-entries/active')).json()).toBeNull()
      const restart = await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: s.taskIds[0] },
      })
      expect(restart.status).toBe(201)
    })

    it('GET /api/time-entries/active?task=ID respects the task scope', async () => {
      const s = await seedMinimal(ctx.db, { clients: 1, projects: 1, tasks: 2, people: 1 })
      const started = await apiFetch(ctx.app, '/api/time-entries/start', {
        method: 'POST',
        body: { taskId: s.taskIds[0] },
      })
      const { id } = (await started.json()) as { id: string }

      const scoped = (await (
        await apiFetch(ctx.app, `/api/time-entries/active?task=${s.taskIds[0]}`)
      ).json()) as { id: string } | null
      expect(scoped?.id).toBe(id)
      const other = await (
        await apiFetch(ctx.app, `/api/time-entries/active?task=${s.taskIds[1]}`)
      ).json()
      expect(other).toBeNull()
    })
  })
})
