import type { ApiClient } from '@tortuga-os/api-client'
import type { InboxItemDTO, InboxKind } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface InboxPanelProps {
  client: ApiClient
  onClose?: () => void
}

const KIND_LABEL: Record<InboxKind, string> = {
  agent_run_failed: 'Agente falló',
  agent_run_succeeded: 'Agente terminó',
  gate_failed: 'Gate falló',
  task_blocked: 'Task bloqueado',
  release_built: 'Release listo',
  info: 'Info',
}

const KIND_TONE: Record<InboxKind, 'danger' | 'turtle' | 'warning' | 'neutral' | 'brand'> = {
  agent_run_failed: 'danger',
  agent_run_succeeded: 'turtle',
  gate_failed: 'danger',
  task_blocked: 'warning',
  release_built: 'brand',
  info: 'neutral',
}

function fmtRelative(ms: number): string {
  const diff = Date.now() - ms
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

/**
 * Universal operator inbox. Lists system events (agent runs finishing,
 * gates failing, releases built) in chronological order with one-click
 * dismiss and "mark all as read". Filter by unread-only to focus on
 * what still needs attention.
 */
export function InboxPanel({ client, onClose }: InboxPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const { data, error, loading } = useAsyncData(
    () => client.inbox.list(unreadOnly ? { unreadOnly: true } : undefined),
    [client, refreshKey, unreadOnly],
  )

  const [busy, setBusy] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)

  async function markRead(item: InboxItemDTO) {
    setBusy(true)
    setOpError(null)
    try {
      await client.inbox.markRead(item.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setOpError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function dismiss(item: InboxItemDTO) {
    if (!confirm('Eliminar este aviso de la bandeja?')) return
    setBusy(true)
    setOpError(null)
    try {
      await client.inbox.remove(item.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setOpError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function markAllRead() {
    setBusy(true)
    setOpError(null)
    try {
      await client.inbox.markAllRead()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setOpError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const unreadCount = data?.filter((i) => i.readAt === null).length ?? 0

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
            Bandeja de eventos
          </h3>
          <div className="text-[12px] text-text-muted mt-1">
            Avisos del sistema: agent runs, gates, releases. Marca leído para ocultar, elimina para
            borrar definitivamente.
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✗
          </Button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12px] text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
          />
          <span>Solo no leídos</span>
        </label>
        <Button
          size="sm"
          variant="ghost"
          onClick={markAllRead}
          disabled={busy || unreadCount === 0}
        >
          Marcar todo como leído
        </Button>
      </div>

      {opError && <div className="mt-2 text-[12px] text-danger">{opError}</div>}

      <div className="mt-4 border-t border-border pt-3">
        <Eyebrow>Avisos ({data?.length ?? 0})</Eyebrow>
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-6">
            Bandeja vacía. Nada que reportarte por ahora.
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {data?.map((item) => {
            const unread = item.readAt === null
            return (
              <div
                key={item.id}
                className={`flex items-start justify-between rounded-md border border-border px-3 py-2 gap-2 ${unread ? 'bg-bg-alt' : 'bg-bg/30'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={KIND_TONE[item.kind]} outline>
                      {KIND_LABEL[item.kind]}
                    </Badge>
                    <span
                      className={`text-[13px] truncate ${unread ? 'text-text font-medium' : 'text-text-muted'}`}
                    >
                      {item.title}
                    </span>
                    <span className="text-[11px] font-mono text-text-dim">
                      {fmtRelative(item.createdAt)}
                    </span>
                  </div>
                  {item.body && (
                    <div className="text-[11px] text-text-muted mt-1 whitespace-pre-wrap">
                      {item.body}
                    </div>
                  )}
                </div>
                {unread && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markRead(item)}
                    disabled={busy}
                    title="Marcar leído"
                  >
                    ✓
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismiss(item)}
                  disabled={busy}
                  title="Eliminar"
                >
                  ✗
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
