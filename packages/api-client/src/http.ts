import { type ApiClientConfig, ApiError } from './types'

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export async function request<T>(
  config: ApiClientConfig,
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const f = config.fetch ?? fetch
  const headers: Record<string, string> = { accept: 'application/json' }
  if (config.secret) headers['x-tortuga-secret'] = config.secret
  if (body !== undefined) headers['content-type'] = 'application/json'
  const init: RequestInit = { method, headers }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  const res = await f(`${config.baseUrl}${path}`, init)
  if (res.status === 204) return undefined as never
  const json = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : null
  if (!res.ok) {
    // Sidecar routes return either a structured `{ error: { code, message } }`
    // or a plain `{ error: "texto" }`. Normalize the plain-string form so the
    // operator sees the real message instead of "api 422: undefined".
    const raw = (json as { error?: unknown } | null)?.error
    const body =
      typeof raw === 'string'
        ? { code: 'error', message: raw }
        : ((raw as { code: string } | undefined) ?? { code: 'unknown' })
    throw new ApiError(res.status, body)
  }
  return json as T
}
