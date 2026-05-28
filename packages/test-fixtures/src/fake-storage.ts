/**
 * In-memory Storage adapter for tests.
 *
 * Implements the minimum surface needed by the most common use-case
 * tests. Operations are not transactional in the SQLite sense; tests
 * that depend on rollback should mock at a higher level.
 */

import type { Storage } from '@tortuga-os/core'

type Unimplemented = (...args: never[]) => never

/**
 * Build a fake Storage where unimplemented methods throw a descriptive
 * error. Call sites override only what their test exercises.
 */
export function makeFakeStorage(overrides: Partial<Storage> = {}): Storage {
  const unimplemented: Unimplemented = ((..._args: never[]) => {
    throw new Error('fake-storage: method not stubbed for this test')
  }) as Unimplemented

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop in target) return target[prop as string]
      return unimplemented
    },
  }
  return new Proxy<Record<string, unknown>>(
    overrides as Record<string, unknown>,
    handler,
  ) as unknown as Storage
}
