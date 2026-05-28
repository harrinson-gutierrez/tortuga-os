import type { ApiClient } from '@tortuga-os/api-client'
import { Button, Card, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface PeoplePanelProps {
  client: ApiClient
  onClose?: () => void
}

export function PeoplePanel({ client, onClose }: PeoplePanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, loading } = useAsyncData(() => client.people.list(), [client, refreshKey])

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function add() {
    if (!name.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.people.create({
        name: name.trim(),
        email: email.trim() || undefined,
      })
      setName('')
      setEmail('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Personas</h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>

      <div className="mt-5 grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <TextField
          label="Nombre"
          placeholder="Persona"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Email (opcional)"
          type="email"
          placeholder="persona@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button onClick={add} disabled={submitting}>
          {submitting ? '…' : '+ Agregar'}
        </Button>
      </div>
      {submitError && <div className="mt-2 text-[12px] text-danger">{submitError}</div>}

      <div className="mt-6 border-t border-border">
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">Aún no hay personas.</div>
        )}
        {data?.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border-b border-border py-2.5 gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{p.name}</div>
              {p.email && <div className="text-[11px] text-text-muted">{p.email}</div>}
            </div>
            <div className="font-mono text-[10px] text-text-dim shrink-0">{p.id.slice(-8)}</div>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                if (!confirm(`Eliminar a ${p.name}?`)) return
                try {
                  await client.people.delete(p.id)
                  setRefreshKey((k) => k + 1)
                } catch (err) {
                  setSubmitError((err as Error).message)
                }
              }}
              title="Soft-delete"
            >
              ✗
            </Button>
          </div>
        ))}
      </div>
    </Card>
  )
}
