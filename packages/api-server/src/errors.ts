import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

function flattenZodIssues(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }))
}

/**
 * Global error mapper. Use-cases never throw (they return UseCaseResult);
 * what reaches this handler is either:
 * - a zod validation error from a route schema (-> 400),
 * - a Hono HTTPException (-> native status),
 * - an unexpected JS error (-> 500, logged via the injected logger).
 */
export interface ApiErrorHandlerDeps {
  logError(message: string, meta: Record<string, unknown>): void
}

export function makeErrorHandler(deps: ApiErrorHandlerDeps) {
  return (err: Error, c: Context) => {
    if (err instanceof ZodError) {
      return c.json(
        {
          error: {
            code: 'validation',
            message: 'Invalid request payload',
            details: flattenZodIssues(err),
          },
        },
        400,
      )
    }
    if (err instanceof HTTPException) {
      return c.json({ error: { code: 'http', message: err.message } }, err.status)
    }
    deps.logError('Unhandled internal error', {
      err: err.message,
      path: c.req.path,
    })
    return c.json({ error: { code: 'internal', message: err.message } }, 500)
  }
}
