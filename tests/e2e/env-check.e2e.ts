// assertRequiredEnv() is the boot-time gate that decides whether the sidecar
// is configured well enough to start. Strict in production (handshake token
// required), permissive in dev. These tests pin both modes so a refactor can't
// silently relax the production check.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertRequiredEnv } from '../../apps/sidecar/src/shared/env'

const KEYS = [
  'NODE_ENV',
  'TORTUGA_HANDSHAKE_TOKEN',
  'PORT',
  'LOG_LEVEL',
  'TORTUGA_MAX_CONCURRENT_RUNS',
  'TORTUGA_AGENTS_DIR',
  'TORTUGA_RESOURCE_DIR',
] as const

describe('assertRequiredEnv (dev mode — NODE_ENV !== production)', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k]
    for (const k of KEYS) delete process.env[k]
  })

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('ok=true with no env vars at all (dev is permissive)', () => {
    const r = assertRequiredEnv()
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('warns but does not fail on a short handshake token', () => {
    process.env.TORTUGA_HANDSHAKE_TOKEN = 'short'
    const r = assertRequiredEnv()
    expect(r.ok).toBe(true)
    expect(r.warnings.join('\n')).toMatch(/too short|only 5 chars/i)
  })

  it('rejects an invalid PORT regardless of mode', () => {
    process.env.PORT = '70000'
    const r = assertRequiredEnv()
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/PORT/)
  })

  it('warns on an unknown LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'verbose-shout'
    const r = assertRequiredEnv()
    expect(r.ok).toBe(true)
    expect(r.warnings.join('\n')).toMatch(/LOG_LEVEL/)
  })

  it('rejects a non-numeric or <1 TORTUGA_MAX_CONCURRENT_RUNS', () => {
    process.env.TORTUGA_MAX_CONCURRENT_RUNS = '0'
    expect(assertRequiredEnv().ok).toBe(false)
    process.env.TORTUGA_MAX_CONCURRENT_RUNS = 'abc'
    expect(assertRequiredEnv().ok).toBe(false)
  })

  it('rejects pointing TORTUGA_AGENTS_DIR at a non-existent path', () => {
    process.env.TORTUGA_AGENTS_DIR = '/no/such/dir/please/ignore'
    const r = assertRequiredEnv()
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/TORTUGA_AGENTS_DIR/)
  })
})

describe('assertRequiredEnv (production mode — NODE_ENV=production)', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k]
    for (const k of KEYS) delete process.env[k]
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('refuses to start without TORTUGA_HANDSHAKE_TOKEN', () => {
    const r = assertRequiredEnv()
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/TORTUGA_HANDSHAKE_TOKEN is required/)
  })

  it('refuses a token shorter than 16 chars', () => {
    process.env.TORTUGA_HANDSHAKE_TOKEN = 'too-short-15chr'
    const r = assertRequiredEnv()
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toMatch(/too short/)
  })

  it('passes with a long enough handshake token', () => {
    process.env.TORTUGA_HANDSHAKE_TOKEN = 'a-perfectly-long-token-1234567890'
    const r = assertRequiredEnv()
    expect(r.ok).toBe(true)
  })
})
