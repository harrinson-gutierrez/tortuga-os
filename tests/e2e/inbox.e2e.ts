// Real inbox: persisted messages with read/archived flags and project links.
// Replaces the F0 placeholder that returned 4 hardcoded items.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('/api/inbox', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET / returns empty array on fresh DB (default filter=unread)', async () => {
    const res = await apiFetch(ctx.app, '/api/inbox')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('GET /count-unread returns 0 on fresh DB', async () => {
    const res = await apiFetch(ctx.app, '/api/inbox/count-unread')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(0)
  })

  it('POST / creates a message with sensible defaults', async () => {
    const res = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'client wants the H1 invoice resent' },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      id: string
      subject: string
      source: string
      readAt: number | null
      archivedAt: number | null
      receivedAt: number
    }
    expect(body.id).toBeTruthy()
    expect(body.subject).toBe('client wants the H1 invoice resent')
    expect(body.source).toBe('manual')
    expect(body.readAt).toBeNull()
    expect(body.archivedAt).toBeNull()
    expect(typeof body.receivedAt).toBe('number')
  })

  it('POST / rejects empty subject', async () => {
    const res = await apiFetch(ctx.app, '/api/inbox', { method: 'POST', body: { subject: '' } })
    expect(res.status).toBe(400)
  })

  it('POST / rejects projectId that does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'hello', projectId: '019e0000-0000-7000-8000-000000000000' },
    })
    expect(res.status).toBe(400)
  })

  it('POST / dedups on externalId — second call returns the same row', async () => {
    const first = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'first', externalId: 'gmail-msg-1' },
    })
    const a = (await first.json()) as { id: string }
    const second = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'second-ignored', externalId: 'gmail-msg-1' },
    })
    const b = (await second.json()) as { id: string; subject: string }
    expect(b.id).toBe(a.id)
    expect(b.subject).toBe('first') // dedup wins
  })

  it('POST / decorates with projectCode when projectId is provided', async () => {
    const seed = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'project-tagged', projectId: seed.projectIds[0]! },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { projectCode: string | null }
    expect(body.projectCode).toBeTruthy()
  })

  it('PATCH /:id marks read and unread', async () => {
    const create = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'unread item' },
    })
    const { id } = (await create.json()) as { id: string }

    const markRead = await apiFetch(ctx.app, `/api/inbox/${id}`, {
      method: 'PATCH',
      body: { read: true },
    })
    expect(markRead.status).toBe(200)
    const read = (await markRead.json()) as { readAt: number | null }
    expect(typeof read.readAt).toBe('number')

    const markUnread = await apiFetch(ctx.app, `/api/inbox/${id}`, {
      method: 'PATCH',
      body: { read: false },
    })
    const unread = (await markUnread.json()) as { readAt: number | null }
    expect(unread.readAt).toBeNull()
  })

  it('PATCH /:id archives and unarchives', async () => {
    const create = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'to archive' },
    })
    const { id } = (await create.json()) as { id: string }

    const arch = await apiFetch(ctx.app, `/api/inbox/${id}`, {
      method: 'PATCH',
      body: { archived: true },
    })
    const archived = (await arch.json()) as { archivedAt: number | null }
    expect(typeof archived.archivedAt).toBe('number')

    const unarch = await apiFetch(ctx.app, `/api/inbox/${id}`, {
      method: 'PATCH',
      body: { archived: false },
    })
    const unarchived = (await unarch.json()) as { archivedAt: number | null }
    expect(unarchived.archivedAt).toBeNull()
  })

  it('GET ?filter=unread excludes archived', async () => {
    const a = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'fresh' },
    })
    const aId = ((await a.json()) as { id: string }).id
    const b = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'will-archive' },
    })
    const bId = ((await b.json()) as { id: string }).id
    await apiFetch(ctx.app, `/api/inbox/${bId}`, {
      method: 'PATCH',
      body: { archived: true },
    })

    const unreadRes = await apiFetch(ctx.app, '/api/inbox?filter=unread')
    const unread = (await unreadRes.json()) as Array<{ id: string }>
    expect(unread.map((m) => m.id)).toEqual([aId])

    const archivedRes = await apiFetch(ctx.app, '/api/inbox?filter=archived')
    const archived = (await archivedRes.json()) as Array<{ id: string }>
    expect(archived.map((m) => m.id)).toEqual([bId])

    const allRes = await apiFetch(ctx.app, '/api/inbox?filter=all')
    const all = (await allRes.json()) as Array<{ id: string }>
    expect(all.length).toBe(2)
  })

  it('GET ?filter=invalid returns 400', async () => {
    const res = await apiFetch(ctx.app, '/api/inbox?filter=nonsense')
    expect(res.status).toBe(400)
  })

  it('GET / returns messages newest-first', async () => {
    await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'old', receivedAt: 1000 },
    })
    await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'new', receivedAt: 2000 },
    })
    const res = await apiFetch(ctx.app, '/api/inbox')
    const body = (await res.json()) as Array<{ subject: string }>
    expect(body.map((m) => m.subject)).toEqual(['new', 'old'])
  })

  it('count-unread reflects only unread + non-archived', async () => {
    const a = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'a' },
    })
    const b = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'b' },
    })
    const c = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'c' },
    })
    const bId = ((await b.json()) as { id: string }).id
    const cId = ((await c.json()) as { id: string }).id
    void (await a.json())
    await apiFetch(ctx.app, `/api/inbox/${bId}`, { method: 'PATCH', body: { read: true } })
    await apiFetch(ctx.app, `/api/inbox/${cId}`, { method: 'PATCH', body: { archived: true } })

    const res = await apiFetch(ctx.app, '/api/inbox/count-unread')
    const body = (await res.json()) as { count: number }
    expect(body.count).toBe(1)
  })

  it('DELETE /:id removes the row', async () => {
    const create = await apiFetch(ctx.app, '/api/inbox', {
      method: 'POST',
      body: { subject: 'goodbye' },
    })
    const { id } = (await create.json()) as { id: string }
    const del = await apiFetch(ctx.app, `/api/inbox/${id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)

    const after = await apiFetch(ctx.app, `/api/inbox/${id}`)
    expect(after.status).toBe(404)
  })
})
