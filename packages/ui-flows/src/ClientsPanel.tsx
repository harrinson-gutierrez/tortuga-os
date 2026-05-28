import type { ApiClient } from '@tortuga-os/api-client'
import type { ClientDTO } from '@tortuga-os/contracts'
import { Button, Card, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface ClientsPanelProps {
  client: ApiClient
  onClose?: () => void
}

/**
 * CRUD panel for the `clients` table. Mirrors PeoplePanel's shape:
 * inline create form on top, then a list with soft-delete per row.
 *
 * The create-project flow already exposes a clients dropdown, so this
 * panel is the canonical place to manage tax IDs, contact emails and
 * Drive folder references — fields that the dropdown only shows by
 * name.
 */
export function ClientsPanel({ client, onClose }: ClientsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, loading } = useAsyncData(() => client.clients.list(), [client, refreshKey])

  const [name, setName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [driveFolderId, setDriveFolderId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function add() {
    if (!name.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.clients.create({
        name: name.trim(),
        taxId: taxId.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        driveFolderId: driveFolderId.trim() || undefined,
      })
      setName('')
      setTaxId('')
      setContactEmail('')
      setDriveFolderId('')
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
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Clientes</h3>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>

      <div className="mt-5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Nombre"
            placeholder="Ej. Acme S.A.S."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="NIT / Tax ID (opcional)"
            placeholder="901.234.567-8"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Email de contacto (opcional)"
            type="email"
            placeholder="contacto@acme.co"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
          />
          <TextField
            label="Drive folder ID (opcional)"
            placeholder="1AbC..."
            value={driveFolderId}
            onChange={(e) => setDriveFolderId(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={add} disabled={submitting}>
            {submitting ? '…' : '+ Agregar cliente'}
          </Button>
        </div>
        {submitError && <div className="text-[12px] text-danger">{submitError}</div>}
      </div>

      <div className="mt-6 border-t border-border">
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">Aún no hay clientes.</div>
        )}
        {data?.map((c) => (
          <ClientRow
            key={c.id}
            client={client}
            row={c}
            onChanged={() => setRefreshKey((k) => k + 1)}
            onError={(msg) => setSubmitError(msg)}
          />
        ))}
      </div>
    </Card>
  )
}

function ClientRow({
  client,
  row,
  onChanged,
  onError,
}: {
  client: ApiClient
  row: ClientDTO
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(row.name)
  const [taxId, setTaxId] = useState(row.taxId ?? '')
  const [contactEmail, setContactEmail] = useState(row.contactEmail ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await client.clients.patch(row.id, {
        name: name.trim() || row.name,
        taxId: taxId.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
      })
      setEditing(false)
      onChanged()
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Eliminar cliente "${row.name}"? (soft-delete)`)) return
    setBusy(true)
    try {
      await client.clients.delete(row.id)
      onChanged()
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between border-b border-border py-2.5 gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{row.name}</div>
          <div className="text-[11px] text-text-muted truncate">
            {row.taxId && <span>NIT {row.taxId}</span>}
            {row.taxId && row.contactEmail && <span> · </span>}
            {row.contactEmail}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
            ✎
          </Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
            ✗
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-brand/40 bg-brand/5 px-3 py-2 my-1 space-y-2">
      <TextField
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="NIT"
          value={taxId}
          onChange={(e) => setTaxId(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" variant="turtle" onClick={save} disabled={busy}>
          {busy ? '…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
