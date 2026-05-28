import { logger } from '../../shared/logger'

/**
 * Web + device preview embedded inside Tortuga.
 *
 * Two surfaces:
 *
 * 1. WEB PREVIEW — scans localhost for dev servers (Next.js, Vite,
 *    Flutter web, etc.) so the operator can iframe them inside Tortuga
 *    instead of alt-tabbing to a browser. Best-effort: probes a set of
 *    well-known ports with a short HEAD timeout and returns the ones
 *    that respond + a guess at what they are based on response headers
 *    or HTML <title>.
 *
 * 2. DEVICE PREVIEW — wraps `adb` so a connected Android emulator or
 *    physical device can be screenshot-streamed into Tortuga. Used by
 *    runtime-smoke and by the operator when debugging a Flutter app.
 */

// Default ports per stack — Tortuga checks these first, then a small
// scan range as a fallback. Keep the list short; the scan budget is
// total wallclock < 800ms.
const KNOWN_PORTS: Array<{ port: number; hint: string }> = [
  { port: 3000, hint: 'next' }, // Next.js / Express default
  { port: 3001, hint: 'next' },
  { port: 5173, hint: 'vite' }, // Vite default
  { port: 5174, hint: 'vite' },
  { port: 4321, hint: 'astro' },
  { port: 8080, hint: 'flutter-web' }, // Flutter web default
  { port: 8000, hint: 'python' },
  { port: 8888, hint: 'jupyter' },
  { port: 4200, hint: 'angular' },
  { port: 4000, hint: 'rails-or-phoenix' },
  { port: 1313, hint: 'hugo' },
  { port: 19006, hint: 'expo-web' },
]

const PROBE_TIMEOUT_MS = 350

export interface WebPreviewCandidate {
  port: number
  url: string
  hint: string
  title: string | null
  ok: boolean
}

/**
 * HEAD-probe a localhost port. Returns the candidate if anything
 * answers within the timeout; null on connection refused, timeout,
 * DNS, etc. (so the scan keeps moving).
 */
async function probePort(port: number, hint: string): Promise<WebPreviewCandidate | null> {
  const url = `http://localhost:${port}/`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS)
  try {
    // Prefer GET because some dev servers don't implement HEAD properly
    // (Vite returns 404 on HEAD /). Limit body via signal abort.
    const res = await fetch(url, { signal: ctrl.signal, method: 'GET' })
    let title: string | null = null
    try {
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('text/html')) {
        const txt = await res.text()
        const m = txt.match(/<title>([^<]*)<\/title>/i)
        if (m?.[1]) title = m[1].trim().slice(0, 120)
      }
    } catch {
      // body read might abort — that's fine, we already have the status
    }
    return { port, url, hint, title, ok: res.ok || res.status === 404 }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Scan known ports in parallel. Returns the ones that responded with
 * a server (any response, not just 200).
 */
export async function scanLocalhostForWebPreviews(): Promise<WebPreviewCandidate[]> {
  const results = await Promise.all(KNOWN_PORTS.map((k) => probePort(k.port, k.hint)))
  return results.filter((r): r is WebPreviewCandidate => r !== null)
}

/**
 * Single-port probe (used when the operator types a custom port).
 */
export async function probeSinglePort(port: number): Promise<WebPreviewCandidate | null> {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${port}`)
  }
  const known = KNOWN_PORTS.find((k) => k.port === port)
  return probePort(port, known?.hint ?? 'unknown')
}

/**
 * Single-URL probe. Useful when the operator pastes a full URL and we
 * want to confirm it actually answers + capture the title for the
 * picker.
 */
export async function probeUrl(
  rawUrl: string,
): Promise<{ ok: boolean; title: string | null; status: number | null }> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1' && url.hostname !== '[::1]') {
    throw new Error('Only localhost / 127.0.0.1 preview targets are allowed for security')
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS * 2)
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal, method: 'GET' })
    let title: string | null = null
    try {
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('text/html')) {
        const txt = await res.text()
        const m = txt.match(/<title>([^<]*)<\/title>/i)
        if (m?.[1]) title = m[1].trim().slice(0, 120)
      }
    } catch {
      // ignore
    }
    return { ok: res.ok, title, status: res.status }
  } catch (err) {
    logger.warn({ rawUrl, err: (err as Error).message }, 'probeUrl failed')
    return { ok: false, title: null, status: null }
  } finally {
    clearTimeout(timer)
  }
}
