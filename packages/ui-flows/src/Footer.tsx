import type { ApiClient } from '@tortuga-os/api-client'
import { Dot } from '@tortuga-os/ui'
import { useEffect, useState } from 'react'

export interface FooterProps {
  client: ApiClient
}

export function Footer({ client }: FooterProps) {
  const [now, setNow] = useState(() => new Date())
  const [healthy, setHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    function ping() {
      client
        .health()
        .then(() => {
          if (!cancelled) setHealthy(true)
        })
        .catch(() => {
          if (!cancelled) setHealthy(false)
        })
    }
    ping()
    const t = setInterval(ping, 15_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [client])

  const tone = healthy === null ? 'muted' : healthy ? 'turtle' : 'danger'
  const status = healthy === null ? '…' : healthy ? 'sidecar ok' : 'sidecar down'

  return (
    <footer className="h-9 shrink-0 flex items-center justify-between px-4 border-t border-border bg-bg text-[11px] font-mono">
      <div className="flex items-center gap-3 text-text-muted">
        <span className="flex items-center gap-1.5">
          <Dot tone={tone} size="xs" pulse={healthy === true} />
          <span>{status}</span>
        </span>
        <span className="text-text-dim">·</span>
        <span className="text-text-dim uppercase tracking-eyebrow">workflow F1..F7</span>
      </div>
      <div className="text-text-muted">
        {now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
    </footer>
  )
}
