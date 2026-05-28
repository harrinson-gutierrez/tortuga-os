/**
 * Discriminated-union Result type used by every state-machine transition.
 *
 * Transitions never throw. They return ok=true with the next snapshot or
 * ok=false with an error code + message. This is what lets `core` decide
 * whether to commit a write or to translate the error into HTTP 4xx.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: TransitionError }

export interface TransitionError {
  code: TransitionErrorCode
  message: string
}

export type TransitionErrorCode =
  | 'invalid_status_transition'
  | 'invariant_violated'
  | 'precondition_failed'
  | 'unknown_event'

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })

export const err = (code: TransitionErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
})
