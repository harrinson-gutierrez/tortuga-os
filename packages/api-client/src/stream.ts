import { type ApiClientConfig, ApiError } from './types'

/**
 * POSTs to a Server-Sent Events endpoint and dispatches each `data:` line
 * (parsed as JSON) to the caller. Resolves when the server closes the
 * stream cleanly; rejects on transport errors.
 *
 * EventSource doesn't support POST + body, so we drive it manually over
 * fetch+ReadableStream. The SSE framing is simple enough to parse inline:
 * we accumulate text until we see a blank line, then we look for the
 * `data:` field and JSON-parse it.
 */
export async function streamSSE<TEvent>(
  config: ApiClientConfig,
  path: string,
  body: unknown,
  onEvent: (ev: TEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const f = config.fetch ?? fetch
  const headers: Record<string, string> = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
  }
  if (config.secret) headers['x-tortuga-secret'] = config.secret

  let res: Response
  try {
    const init: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }
    if (signal) init.signal = signal
    res = await f(`${config.baseUrl}${path}`, init)
  } catch (err) {
    // fetch() throws TypeError on network failures (CORS, server down,
    // mixed-content). Surface a friendlier message than "Failed to fetch".
    const msg = (err as Error).message || 'network error'
    throw new Error(`SSE: no se pudo conectar al sidecar (${msg})`)
  }

  if (!res.ok) {
    let payload: unknown = null
    try {
      payload = await res.json()
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, (payload as { error?: never })?.error ?? { code: 'unknown' })
  }
  if (!res.body) {
    throw new Error('SSE: response has no body')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // SSE events are separated by blank lines. Split on \n\n and keep
    // the trailing partial event in the buffer.
    while (true) {
      const sep = buf.indexOf('\n\n')
      if (sep < 0) break
      const rawEvent = buf.slice(0, sep)
      buf = buf.slice(sep + 2)
      const dataLines: string[] = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (dataLines.length === 0) continue
      const payload = dataLines.join('\n')
      try {
        const parsed = JSON.parse(payload) as TEvent
        onEvent(parsed)
      } catch {
        // ignore malformed events
      }
    }
  }
}
