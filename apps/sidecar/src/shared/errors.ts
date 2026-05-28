import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import { logger } from './logger'

/**
 * Base class for application errors.
 * Every typed error that travels to the HTTP client inherits from here.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

/** Semantic alias (used by newer handlers). */
export class ApiError extends AppError {}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND')
  }
}

export class ValidationError extends AppError {
  /**
   * If `details` is provided, it is serialized in the body with the Zod issues
   * (readable paths + messages). No stack or internal schema is included.
   */
  constructor(
    message: string,
    public details?: ReadonlyArray<{ path: string; message: string }>,
  ) {
    super(400, message, 'VALIDATION')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT')
  }
}

export class IllegalTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(422, `Illegal kanban transition: ${from} -> ${to}`, 'ILLEGAL_TRANSITION')
  }
}

export class HumanSignoffRequiredError extends AppError {
  constructor(column: string) {
    super(
      403,
      `Column '${column}' requires human sign-off. Send signedByHuman=true.`,
      'HUMAN_SIGNOFF_REQUIRED',
    )
  }
}

export class PathTraversalError extends AppError {
  constructor(path: string) {
    super(400, `Path traversal detected: ${path}`, 'PATH_TRAVERSAL')
  }
}

/** Converts a ZodError into a flat list of issues safe to return. */
function flattenZodIssues(err: ZodError): Array<{ path: string; message: string }> {
  return err.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }))
}

/**
 * Global error mapper → HTTP response.
 * - AppError → status + code defined by the class, free-form message.
 * - ZodError → 400 VALIDATION with flattened issues.
 * - Hono HTTPException → native status.
 * - Any other Error → 500 INTERNAL with a generic message (no stack exposed).
 */
export function errorHandler(err: Error, c: Context) {
  if (err instanceof ValidationError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
        },
      },
      400,
    )
  }
  if (err instanceof AppError) {
    return c.json(
      {
        error: { code: err.code, message: err.message },
      },
      err.status as 400 | 401 | 403 | 404 | 409 | 422 | 500,
    )
  }
  if (err instanceof ZodError) {
    return c.json(
      {
        error: {
          code: 'VALIDATION',
          message: 'Invalid request payload',
          details: flattenZodIssues(err),
        },
      },
      400,
    )
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: 'HTTP', message: err.message } }, err.status)
  }
  // Any other error: log the real cause, return generic message to client.
  logger.error({ err: err.message, stack: err.stack, path: c.req.path }, 'Unhandled internal error')
  return c.json(
    {
      error: { code: 'INTERNAL', message: err.message },
    },
    500,
  )
}
