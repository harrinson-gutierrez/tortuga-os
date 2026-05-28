import type { CoreDeps, UseCaseResult } from '@tortuga-os/core'
import { createSqliteStorage } from '@tortuga-os/storage-sqlite'
import { getDb } from './db'
import { AppError, NotFoundError, ValidationError } from './errors'
import { newId } from './ids'
import { createSecretCipher } from './secret-cipher'

let _deps: CoreDeps | null = null

export function coreDeps(): CoreDeps {
  if (_deps) return _deps
  _deps = {
    storage: createSqliteStorage(getDb()),
    newId,
    now: () => Date.now(),
    secretCipher: createSecretCipher(),
  }
  return _deps
}

/**
 * Bridge: turn a core UseCaseResult into a thrown sidecar error so the
 * existing Hono routes keep working unchanged. Step 9 (api-server) will
 * remove this bridge by having the routes return Result-aware responses
 * directly.
 */
export function unwrap<T>(result: UseCaseResult<T>): T {
  if (result.ok) return result.value
  const err = result.error
  switch (err.code) {
    case 'not_found':
      throw new NotFoundError(`${err.entity} ${err.id}`)
    case 'conflict':
      throw new AppError(409, err.reason, 'conflict')
    case 'validation':
      throw new ValidationError(`${err.field}: ${err.message}`)
    case 'invariant':
      throw new AppError(409, err.message, 'invariant_violated')
    case 'state':
      throw new AppError(409, err.message, 'invalid_state_transition')
  }
  // Exhaustiveness guard.
  throw new AppError(500, 'unknown error code', 'unknown_error')
}
