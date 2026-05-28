import type { MiddlewareHandler } from 'hono'

export const DEFAULT_MAX_BODY_BYTES = 1 * 1024 * 1024

export function bodyLimit(maxBytes = DEFAULT_MAX_BODY_BYTES): MiddlewareHandler {
  return async (c, next) => {
    const len = c.req.header('content-length')
    if (len) {
      const n = Number.parseInt(len, 10)
      if (Number.isFinite(n) && n > maxBytes) {
        return c.json(
          {
            error: { code: 'PAYLOAD_TOO_LARGE', message: `Request body exceeds ${maxBytes} bytes` },
          },
          413,
        )
      }
    }
    return next()
  }
}
