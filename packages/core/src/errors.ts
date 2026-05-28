/**
 * Typed errors returned by use-cases.
 *
 * Use-cases never throw. They return `Result<T, UseCaseError>` so the
 * caller (transport) can map the code to an HTTP status, an MCP error
 * payload, or a CLI exit code.
 */

export type UseCaseError =
  | { code: 'not_found'; entity: string; id: string }
  | { code: 'conflict'; reason: string }
  | { code: 'validation'; field: string; message: string }
  | { code: 'invariant'; message: string }
  | { code: 'state'; message: string }

export type UseCaseResult<T> = { ok: true; value: T } | { ok: false; error: UseCaseError }

export const ucOk = <T>(value: T): UseCaseResult<T> => ({ ok: true, value })

export const ucErr = (error: UseCaseError): UseCaseResult<never> => ({
  ok: false,
  error,
})

export const notFound = (entity: string, id: string): UseCaseResult<never> =>
  ucErr({ code: 'not_found', entity, id })

export const conflict = (reason: string): UseCaseResult<never> =>
  ucErr({ code: 'conflict', reason })

export const validation = (field: string, message: string): UseCaseResult<never> =>
  ucErr({ code: 'validation', field, message })

export const state = (message: string): UseCaseResult<never> => ucErr({ code: 'state', message })
