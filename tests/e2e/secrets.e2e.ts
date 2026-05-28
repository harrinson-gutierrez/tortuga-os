// Secrets CRUD endpoint. The plaintext NEVER appears in any GET response —
// the DTO carries only key + length + timestamps. We assert that explicitly
// because a regression here leaks user tokens through the API.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'

describe('/api/secrets', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    ctx.db.$client.close()
  })

  it('GET / returns empty array on fresh DB', async () => {
    const res = await apiFetch(ctx.app, '/api/secrets')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('PUT / stores a secret and returns metadata only (no plaintext)', async () => {
    const res = await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'figma_api_key', value: 'figd_abc123xyz' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { key: string; length: number; createdAt: number }
    expect(body.key).toBe('figma_api_key')
    expect(body.length).toBe('figd_abc123xyz'.length)
    expect(typeof body.createdAt).toBe('number')
    // CRITICAL: plaintext must NEVER appear in the response.
    expect(JSON.stringify(body)).not.toContain('figd_abc123xyz')
  })

  it('PUT / upserts (second call rewrites the value)', async () => {
    await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'token', value: 'old' },
    })
    const second = await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'token', value: 'new-and-longer' },
    })
    expect(second.status).toBe(200)
    const body = (await second.json()) as { length: number }
    expect(body.length).toBe('new-and-longer'.length)

    const list = await apiFetch(ctx.app, '/api/secrets')
    const listBody = (await list.json()) as Array<{ key: string; length: number }>
    expect(listBody.length).toBe(1)
    expect(listBody[0]!.length).toBe('new-and-longer'.length)
  })

  it('PUT / rejects invalid key shape (uppercase, dashes, spaces)', async () => {
    for (const invalidKey of ['FIGMA_KEY', 'figma-key', 'figma key', '1figma', '']) {
      const res = await apiFetch(ctx.app, '/api/secrets', {
        method: 'PUT',
        body: { key: invalidKey, value: 'x' },
      })
      expect(res.status).toBe(400)
    }
  })

  it('PUT / rejects empty value', async () => {
    const res = await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'figma_api_key', value: '' },
    })
    expect(res.status).toBe(400)
  })

  it('GET / never leaks the plaintext', async () => {
    await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'figma_api_key', value: 'figd_VERY_SECRET' },
    })
    const list = await apiFetch(ctx.app, '/api/secrets')
    const raw = await list.text()
    expect(raw).not.toContain('figd_VERY_SECRET')
    expect(raw).toContain('figma_api_key')
  })

  it('DELETE /:key removes the row and returns 204', async () => {
    await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'token', value: 'x' },
    })
    const del = await apiFetch(ctx.app, '/api/secrets/token', { method: 'DELETE' })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/secrets')
    expect(await list.json()).toEqual([])
  })

  it('DELETE /:key returns 404 when the secret does not exist', async () => {
    const del = await apiFetch(ctx.app, '/api/secrets/missing', { method: 'DELETE' })
    expect(del.status).toBe(404)
  })

  it('GET / lists keys alphabetically', async () => {
    await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'zeta_token', value: 'z' },
    })
    await apiFetch(ctx.app, '/api/secrets', {
      method: 'PUT',
      body: { key: 'alpha_token', value: 'a' },
    })
    const list = await apiFetch(ctx.app, '/api/secrets')
    const body = (await list.json()) as Array<{ key: string }>
    expect(body.map((s) => s.key)).toEqual(['alpha_token', 'zeta_token'])
  })
})
