import type { Context, MiddlewareHandler } from 'hono'

/**
 * Handshake token between the Tauri shell and the sidecar.
 *
 * Motivation
 * ----------
 * The sidecar listens on 127.0.0.1 and is unreachable from another host, but
 * any of the user's processes could talk to it (a browser, another electron, an
 * extension). To prevent that, the shell generates a random nonce at startup
 * and passes it to the sidecar via the `TORTUGA_HANDSHAKE_TOKEN` env var.
 *
 * - The web app (running inside the Tauri WebView) requests that token from the
 *   shell through a Tauri command (`get_sidecar_token`) and sends it on every
 *   request in the `X-Tortuga-Secret` header.
 * - SSE does not support custom headers from `EventSource`, so we also accept
 *   the token in the `_secret` query param.
 * - `/health` is exempt to allow simple liveness probes (curl) during
 *   development. It does NOT return sensitive data.
 *
 * If the env var is not set, the sidecar still starts but LOGs a WARN and does
 * NOT enforce the handshake — this makes standalone `pnpm dev` (no Tauri shell)
 * easier. In bundled mode it is always set because the Rust shell sets it.
 */

export const HANDSHAKE_HEADER = 'x-tortuga-secret'
export const HANDSHAKE_QUERY = '_secret'

let cachedToken: string | null | undefined

/**
 * Reads `TORTUGA_HANDSHAKE_TOKEN` from the environment.
 * Returns `null` if it is not set (standalone dev mode).
 */
export function loadHandshakeToken(): string | null {
  if (cachedToken !== undefined) return cachedToken
  const raw = process.env.TORTUGA_HANDSHAKE_TOKEN
  if (!raw || raw.trim().length === 0) {
    cachedToken = null
    return null
  }
  if (raw.length < 16) {
    // Token too short = misconfiguration. Do not start insecure silently.
    throw new Error('TORTUGA_HANDSHAKE_TOKEN is set but shorter than 16 chars. Refusing to start.')
  }
  cachedToken = raw
  return cachedToken
}

/** Tests only: reset the cache. */
export function _resetHandshakeCacheForTests(): void {
  cachedToken = undefined
}

/**
 * Hono middleware that requires the `X-Tortuga-Secret` header (or `_secret`
 * query) on every request, except `/health` and CORS preflight (`OPTIONS`).
 *
 * Constant-time secret comparison so it does not leak via timing.
 */
export function requireHandshake(): MiddlewareHandler {
  const expected = loadHandshakeToken()
  return async (c: Context, next) => {
    // No token configured -> permissive dev mode. Logged once at startup,
    // not on every request.
    if (expected === null) {
      return next()
    }
    // Health check exempt (local liveness probe).
    if (c.req.path === '/health') {
      return next()
    }
    // CORS preflight must not require a handshake.
    if (c.req.method === 'OPTIONS') {
      return next()
    }
    const headerVal = c.req.header(HANDSHAKE_HEADER) ?? ''
    const queryVal = c.req.query(HANDSHAKE_QUERY) ?? ''
    const provided = headerVal || queryVal
    if (!provided || !timingSafeEqual(provided, expected)) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid handshake token' } },
        401,
      )
    }
    return next()
  }
}

/** Compares two strings in constant time with respect to their content. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
