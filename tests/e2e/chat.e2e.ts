import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('chat router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/chat/threads on an empty DB returns []', async () => {
    const res = await apiFetch(ctx.app, '/api/chat/threads')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST /api/chat/threads creates a thread + first user message', async () => {
    const res = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: {
        content: 'Joy Hotels wants a payments module: integrate Stripe',
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      thread: { id: string; title: string; projectId: string | null }
      message: { role: string; content: string }
    }
    expect(body.thread.id).toBeTruthy()
    expect(body.thread.title).toMatch(/Joy Hotels/)
    expect(body.thread.projectId).toBeNull()
    expect(body.message.role).toBe('user')
    expect(body.message.content).toMatch(/Stripe/)
  })

  it('POST /api/chat/threads links to a project when projectId is given', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: {
        content: 'Which tasks are we behind on?',
        projectId: seeded.projectIds[0],
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { thread: { projectId: string } }
    expect(body.thread.projectId).toBe(seeded.projectIds[0])
  })

  it('POST /api/chat/threads 404 when projectId does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'X', projectId: 'p-nope' },
    })
    expect(res.status).toBe(404)
  })

  it('POST /api/chat/threads 400 on empty content', async () => {
    const res = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: '' },
    })
    expect(res.status).toBe(400)
  })

  it('GET /api/chat/threads/:id returns the thread with messages', async () => {
    const start = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'first message' },
    })
    const { thread } = (await start.json()) as { thread: { id: string } }

    const res = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      id: string
      messages: Array<{ role: string; content: string }>
    }
    expect(body.id).toBe(thread.id)
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0]!.role).toBe('user')
  })

  it('GET /api/chat/threads/:id 404', async () => {
    const res = await apiFetch(ctx.app, '/api/chat/threads/nope')
    expect(res.status).toBe(404)
  })

  it('POST /api/chat/threads/:id/messages appends a turn (user)', async () => {
    const start = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'initial' },
    })
    const { thread } = (await start.json()) as { thread: { id: string } }

    const res = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}/messages`, {
      method: 'POST',
      body: { role: 'user', content: 'second turn' },
    })
    expect(res.status).toBe(201)

    const full = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}`)
    const body = (await full.json()) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(body.messages).toHaveLength(2)
    expect(body.messages[1]!.content).toBe('second turn')
  })

  it('POST /api/chat/threads/:id/messages supports the agent role and agentRunId', async () => {
    const start = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'initial' },
    })
    const { thread } = (await start.json()) as { thread: { id: string } }

    const res = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}/messages`, {
      method: 'POST',
      body: {
        role: 'agent',
        content: 'agent reply',
        agentRunId: 'run-001',
      },
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as {
      role: string
      agentRunId: string | null
    }
    expect(body.role).toBe('agent')
    expect(body.agentRunId).toBe('run-001')
  })

  it('POST /api/chat/threads/:id/messages 400 on an invalid role', async () => {
    const start = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'x' },
    })
    const { thread } = (await start.json()) as { thread: { id: string } }

    const res = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}/messages`, {
      method: 'POST',
      body: { role: 'nobody', content: 'x' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /api/chat/threads/:id updates the title and the proposal link', async () => {
    const start = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'x' },
    })
    const { thread } = (await start.json()) as { thread: { id: string } }

    const res = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}`, {
      method: 'PATCH',
      body: { title: 'Renamed', proposalId: 'pr-001' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      title: string
      proposalId: string | null
    }
    expect(body.title).toBe('Renamed')
    expect(body.proposalId).toBe('pr-001')
  })

  it('DELETE /api/chat/threads/:id soft-deletes', async () => {
    const start = await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'x' },
    })
    const { thread } = (await start.json()) as { thread: { id: string } }

    const del = await apiFetch(ctx.app, `/api/chat/threads/${thread.id}`, {
      method: 'DELETE',
    })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/chat/threads')
    expect(await list.json()).toEqual([])
  })

  it('GET /api/chat/threads?project=ID filters', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 2 })
    await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'x', projectId: seeded.projectIds[0] },
    })
    await apiFetch(ctx.app, '/api/chat/threads', {
      method: 'POST',
      body: { content: 'y', projectId: seeded.projectIds[1] },
    })

    const res = await apiFetch(ctx.app, `/api/chat/threads?project=${seeded.projectIds[0]}`)
    const body = (await res.json()) as Array<{ projectId: string }>
    expect(body).toHaveLength(1)
    expect(body[0]!.projectId).toBe(seeded.projectIds[0])
  })
})
