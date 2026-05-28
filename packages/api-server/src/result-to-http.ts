import type { UseCaseResult } from '@tortuga-os/core'
import type { Context } from 'hono'

const CODE_TO_STATUS: Record<string, number> = {
  not_found: 404,
  conflict: 409,
  validation: 400,
  invariant: 409,
  state: 409,
}

/**
 * Maps a UseCaseResult to a Hono Response. Replaces the throw-and-catch
 * bridge used by the legacy sidecar. Errors carry { code, ...details }.
 */
export function respond<T>(c: Context, result: UseCaseResult<T>, okStatus: 200 | 201 = 200) {
  if (result.ok) return c.json(result.value as never, okStatus)
  const err = result.error
  const status = CODE_TO_STATUS[err.code] ?? 500
  return c.json({ error: err } as never, status as 200 | 400 | 404 | 409 | 500)
}
