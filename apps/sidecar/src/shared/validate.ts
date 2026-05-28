import type { Context } from 'hono'
import type { ZodError, ZodSchema, z } from 'zod'
import { ValidationError } from './errors'

/**
 * Discriminated result of a validation.
 * Lets callers do `if (!res.success) return res.response` and lets Hono return
 * the correct JSON.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: Response }

function toIssues(err: ZodError) {
  return err.issues.map((i) => ({
    path: i.path.length > 0 ? i.path.join('.') : '(root)',
    message: i.message,
  }))
}

/**
 * Reads the body as JSON and validates it against `schema`.
 * - If the JSON does not parse → 400 with a generic message.
 * - If the body does not match the schema → 400 with readable issues.
 * - If OK → returns `{ success: true, data }`.
 *
 * Does NOT use `.parseAsync` to keep Zod's synchronous signature in this project.
 */
export async function validateBody<S extends ZodSchema>(
  c: Context,
  schema: S,
): Promise<ValidationResult<z.infer<S>>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new ValidationError('Invalid JSON body')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError('Invalid request payload', toIssues(parsed.error))
  }
  return { success: true, data: parsed.data }
}

/**
 * Sync variant for callers that already have the body as an object.
 * Useful when parsing a fragment (not recommended in routes).
 */
export function validateData<S extends ZodSchema>(raw: unknown, schema: S): z.infer<S> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError('Invalid request payload', toIssues(parsed.error))
  }
  return parsed.data
}

/**
 * Validates the request's query params against `schema`.
 * Useful for endpoints with filters or pagination.
 */
export function validateQuery<S extends ZodSchema>(c: Context, schema: S): z.infer<S> {
  const raw = c.req.query()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError('Invalid query parameters', toIssues(parsed.error))
  }
  return parsed.data
}
