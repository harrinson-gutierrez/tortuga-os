// CRUD for the mcp_connections table. test-connection is exercised separately
// because it spawns a real process — covered indirectly by other suites.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'

const baseInput = {
  name: 'figma',
  transport: 'stdio' as const,
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-figma'],
  env: { FIGMA_API_KEY: '' },
  description: 'Figma read/write for the design-architect',
}

const httpInput = {
  name: 'remote-mcp',
  transport: 'http' as const,
  url: 'https://mcp.example.com/mcp',
  headers: { Authorization: 'Bearer abc' },
  description: 'Remote MCP via HTTP',
}

describe('/api/mcp-connections', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    ctx.db.$client.close()
  })

  it('GET / returns empty array on fresh DB', async () => {
    const res = await apiFetch(ctx.app, '/api/mcp-connections')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('POST / creates a connection and GET /:id round-trips it', async () => {
    const create = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: baseInput,
    })
    expect(create.status).toBe(201)
    const dto = (await create.json()) as {
      id: string
      name: string
      args: string[]
      env: Record<string, string>
      enabled: boolean
    }
    expect(dto.name).toBe('figma')
    expect(dto.args).toEqual(['-y', '@modelcontextprotocol/server-figma'])
    expect(dto.env).toEqual({ FIGMA_API_KEY: '' })
    expect(dto.enabled).toBe(true)

    const get = await apiFetch(ctx.app, `/api/mcp-connections/${dto.id}`)
    expect(get.status).toBe(200)
    const fetched = (await get.json()) as { id: string; name: string }
    expect(fetched.id).toBe(dto.id)
    expect(fetched.name).toBe('figma')
  })

  it('POST / rejects duplicated names', async () => {
    await apiFetch(ctx.app, '/api/mcp-connections', { method: 'POST', body: baseInput })
    const second = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { ...baseInput, description: 'duplicate' },
    })
    expect(second.status).toBe(400)
  })

  it('POST / rejects invalid name shape (regex)', async () => {
    const res = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { ...baseInput, name: 'has spaces!' },
    })
    expect(res.status).toBe(400)
  })

  it('PATCH /:id updates fields and keeps the rest', async () => {
    const create = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: baseInput,
    })
    const dto = (await create.json()) as { id: string }

    const patch = await apiFetch(ctx.app, `/api/mcp-connections/${dto.id}`, {
      method: 'PATCH',
      body: { enabled: false, description: 'disabled while debugging' },
    })
    expect(patch.status).toBe(200)
    const updated = (await patch.json()) as {
      enabled: boolean
      description: string
      name: string
      args: string[]
    }
    expect(updated.enabled).toBe(false)
    expect(updated.description).toBe('disabled while debugging')
    // Untouched fields preserved
    expect(updated.name).toBe('figma')
    expect(updated.args).toEqual(['-y', '@modelcontextprotocol/server-figma'])
  })

  it('PATCH /:id rejects renaming to an existing name', async () => {
    await apiFetch(ctx.app, '/api/mcp-connections', { method: 'POST', body: baseInput })
    const create = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { ...baseInput, name: 'drive', description: 'other one' },
    })
    const second = (await create.json()) as { id: string }

    const patch = await apiFetch(ctx.app, `/api/mcp-connections/${second.id}`, {
      method: 'PATCH',
      body: { name: 'figma' },
    })
    expect(patch.status).toBe(400)
  })

  it('GET / lists alphabetically and excludes soft-deleted', async () => {
    await apiFetch(ctx.app, '/api/mcp-connections', { method: 'POST', body: baseInput })
    const second = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { ...baseInput, name: 'drive' },
    })
    const dto2 = (await second.json()) as { id: string }

    const before = (await (await apiFetch(ctx.app, '/api/mcp-connections')).json()) as Array<{
      name: string
    }>
    expect(before.map((r) => r.name)).toEqual(['drive', 'figma'])

    const del = await apiFetch(ctx.app, `/api/mcp-connections/${dto2.id}`, { method: 'DELETE' })
    expect(del.status).toBe(204)

    const after = (await (await apiFetch(ctx.app, '/api/mcp-connections')).json()) as Array<{
      name: string
    }>
    expect(after.map((r) => r.name)).toEqual(['figma'])
  })

  it('GET /:id returns 404 for deleted rows', async () => {
    const create = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: baseInput,
    })
    const dto = (await create.json()) as { id: string }
    await apiFetch(ctx.app, `/api/mcp-connections/${dto.id}`, { method: 'DELETE' })
    const res = await apiFetch(ctx.app, `/api/mcp-connections/${dto.id}`)
    expect(res.status).toBe(404)
  })

  it('POST /:id/test returns a well-shaped result for any command', async () => {
    const create = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { ...baseInput, command: 'this-binary-does-not-exist', args: [] },
    })
    const dto = (await create.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/mcp-connections/${dto.id}/test`, { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; message: string; durationMs: number }
    expect(body.ok).toBe(false)
    expect(typeof body.message).toBe('string')
    expect(typeof body.durationMs).toBe('number')
  }, 30_000)

  it('POST / creates an http connection with url + headers', async () => {
    const res = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: httpInput,
    })
    expect(res.status).toBe(201)
    const dto = (await res.json()) as {
      transport: string
      url: string | null
      headers: Record<string, string>
      command: string
      args: string[]
    }
    expect(dto.transport).toBe('http')
    expect(dto.url).toBe('https://mcp.example.com/mcp')
    expect(dto.headers).toEqual({ Authorization: 'Bearer abc' })
    // Stdio fields are empty for http transport
    expect(dto.command).toBe('')
    expect(dto.args).toEqual([])
  })

  it('POST / rejects http connection without a URL', async () => {
    const res = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { name: 'broken', transport: 'http', headers: {} },
    })
    expect(res.status).toBe(400)
  })

  it('POST /:id/test on an http connection with unreachable URL returns ok=false', async () => {
    const create = await apiFetch(ctx.app, '/api/mcp-connections', {
      method: 'POST',
      body: { ...httpInput, url: 'http://127.0.0.1:1/mcp' }, // port 1 unreachable
    })
    const dto = (await create.json()) as { id: string }
    const res = await apiFetch(ctx.app, `/api/mcp-connections/${dto.id}/test`, { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; message: string; durationMs: number }
    expect(body.ok).toBe(false)
    expect(typeof body.message).toBe('string')
  }, 30_000)
})
