import type { Context, MiddlewareHandler } from 'hono'

export const HANDSHAKE_HEADER = 'x-tortuga-secret'
export const HANDSHAKE_QUERY = '_secret'

export interface HandshakeConfig {
  /** The expected token. If null, the middleware is a no-op (dev mode). */
  expected: string | null
  /** Paths exempt from the handshake (defaults to ['/health']). */
  exemptPaths?: ReadonlyArray<string>
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export function requireHandshake(config: HandshakeConfig): MiddlewareHandler {
  const exempt = new Set(config.exemptPaths ?? ['/health'])
  return async (c: Context, next) => {
    if (config.expected === null) return next()
    if (exempt.has(c.req.path)) return next()
    if (c.req.method === 'OPTIONS') return next()
    const headerVal = c.req.header(HANDSHAKE_HEADER) ?? ''
    const queryVal = c.req.query(HANDSHAKE_QUERY) ?? ''
    const provided = headerVal || queryVal
    if (!provided || !timingSafeEqual(provided, config.expected)) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid handshake token' } },
        401,
      )
    }
    return next()
  }
}
