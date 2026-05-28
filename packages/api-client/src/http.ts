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
    throw new ApiError(res.status, (json as { error?: never })?.error ?? { code: 'unknown' })
  }
  return json as T
}
