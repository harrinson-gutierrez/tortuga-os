import { useCallback, useEffect, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  error: string | null
  loading: boolean
  refetch: () => Promise<void>
}

/**
 * Tiny replacement for react-query in cases where we just need
 * load-once-and-refetch. No cache, no devtools, no peer dep.
 */
export function useAsyncData<T>(fn: () => Promise<T>, deps: ReadonlyArray<unknown>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are the caller's contract
  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Wrap fn() in Promise.resolve so that callers which throw
      // SYNCHRONOUSLY (e.g. `client.foo()` where `foo` is undefined)
      // still surface as an async error instead of bubbling and
      // tearing down the React tree.
      const v = await Promise.resolve().then(fn)
      setData(v)
    } catch (err) {
      setError((err as Error).message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, deps)

  useEffect(() => {
    void run()
  }, [run])

  return { data, error, loading, refetch: run }
}
