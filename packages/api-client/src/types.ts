export interface ApiClientConfig {
  /** Absolute base URL (e.g. http://127.0.0.1:31415). */
  baseUrl: string
  /** Handshake token sent in X-Tortuga-Secret. */
  secret?: string | null
  /** Override the global fetch implementation (useful in tests). */
  fetch?: typeof fetch
}

export interface ApiErrorBody {
  code: string
  message?: string
  reason?: string
  entity?: string
  id?: string
  field?: string
  details?: ReadonlyArray<{ path: string; message: string }>
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
  ) {
    super(`api ${status}: ${body.code}${body.message ? ` — ${body.message}` : ''}`)
    this.name = 'ApiError'
  }
}
