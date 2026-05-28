// Per-agent provider/model routing. Upsert is keyed by agentName so each agent
// has at most one override row — the second call rewrites instead of stacking.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'

const baseInput = {
  agentName: 'senior-dev',
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-6',
  enabled: true,
}

describe('/api/agent-model-overrides', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })

  afterEach(() => {
    ctx.db.$client.close()
  })

  it('GET / returns empty array on a fresh DB', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('PUT / creates a new row when none exists', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides', {
      method: 'PUT',
      body: baseInput,
    })
    expect(res.status).toBe(200)
    const dto = (await res.json()) as {
      agentName: string
      provider: string
      modelId: string
      enabled: boolean
    }
    expect(dto.agentName).toBe('senior-dev')
    expect(dto.provider).toBe('anthropic')
    expect(dto.modelId).toBe('claude-sonnet-4-6')
    expect(dto.enabled).toBe(true)
  })

  it('PUT / rewrites the existing row instead of creating a second one', async () => {
    await apiFetch(ctx.app, '/api/agent-model-overrides', { method: 'PUT', body: baseInput })
    const second = await apiFetch(ctx.app, '/api/agent-model-overrides', {
      method: 'PUT',
      body: { ...baseInput, modelId: 'claude-haiku-4-5-20251001' },
    })
    expect(second.status).toBe(200)

    const list = await apiFetch(ctx.app, '/api/agent-model-overrides')
    const body = (await list.json()) as Array<{ agentName: string; modelId: string }>
    expect(body.length).toBe(1)
    expect(body[0]!.modelId).toBe('claude-haiku-4-5-20251001')
  })

  it('PUT / openai-compat without baseUrl fails with 400', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides', {
      method: 'PUT',
      body: {
        agentName: 'senior-dev',
        provider: 'openai-compat',
        modelId: 'gpt-oss',
        enabled: true,
      },
    })
    expect(res.status).toBe(400)
  })

  it('PUT / accepts ollama with baseUrl', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides', {
      method: 'PUT',
      body: {
        agentName: 'senior-dev',
        provider: 'ollama',
        modelId: 'llama3.2:latest',
        baseUrl: 'http://localhost:11434/v1',
        enabled: true,
      },
    })
    expect(res.status).toBe(200)
    const dto = (await res.json()) as { provider: string; baseUrl: string }
    expect(dto.provider).toBe('ollama')
    expect(dto.baseUrl).toBe('http://localhost:11434/v1')
  })

  it('PUT / rejects an invalid api_key_ref (lowercase)', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides', {
      method: 'PUT',
      body: { ...baseInput, apiKeyRef: 'my_api_key' },
    })
    expect(res.status).toBe(400)
  })

  it('PUT / accepts SCREAMING_SNAKE_CASE api_key_ref', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides', {
      method: 'PUT',
      body: { ...baseInput, apiKeyRef: 'MY_API_KEY' },
    })
    expect(res.status).toBe(200)
    const dto = (await res.json()) as { apiKeyRef: string }
    expect(dto.apiKeyRef).toBe('MY_API_KEY')
  })

  it('GET /:agentName 404 when the override does not exist', async () => {
    const res = await apiFetch(ctx.app, '/api/agent-model-overrides/no-such-agent')
    expect(res.status).toBe(404)
  })

  it('DELETE /:agentName removes the row and returns 204', async () => {
    await apiFetch(ctx.app, '/api/agent-model-overrides', { method: 'PUT', body: baseInput })
    const del = await apiFetch(ctx.app, '/api/agent-model-overrides/senior-dev', {
      method: 'DELETE',
    })
    expect(del.status).toBe(204)

    const list = await apiFetch(ctx.app, '/api/agent-model-overrides')
    expect(await list.json()).toEqual([])
  })
})
