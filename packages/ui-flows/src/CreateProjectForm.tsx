import type { ApiClient } from '@tortuga-os/api-client'
import type { ClientDTO } from '@tortuga-os/contracts'
import { CURRENCIES } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select, Stack, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface CreateProjectFormProps {
  client: ApiClient
  onCreated?: (projectCode: string) => void
  onCancel?: () => void
}

export function CreateProjectForm({ client, onCreated, onCancel }: CreateProjectFormProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState<'COP' | 'USD'>('COP')
  const [clientId, setClientId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  const clientsQuery = useAsyncData(() => client.clients.list(), [client, refresh])
  const [newClientName, setNewClientName] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)

  async function createClient() {
    if (!newClientName.trim()) return
    setCreatingClient(true)
    try {
      const created = await client.clients.create({ name: newClientName.trim() })
      setNewClientName('')
      setClientId(created.id)
      setRefresh((r) => r + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreatingClient(false)
    }
  }

  async function submit() {
    if (!code.trim() || !name.trim() || !clientId) {
      setError('code, name and clientId are required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const created = await client.projects.create({
        code: code.trim(),
        name: name.trim(),
        clientId,
        currency,
        description: description.trim() || undefined,
      })
      onCreated?.(created.code)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const clientOptions = (clientsQuery.data ?? []).map((c: ClientDTO) => ({
    value: c.id,
    label: c.name,
  }))

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
          Nuevo proyecto
        </h3>
        <Badge tone="turtle" outline>
          F1_SALES + Quote v1 auto
        </Badge>
      </div>

      <Stack gap="md" className="mt-5">
        <TextField
          label="Code"
          placeholder="DEMO"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          hint="UPPERCASE alphanumeric, max 32 chars"
        />
        <TextField
          label="Name"
          placeholder="Demo Project"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Description (optional)"
          placeholder="One-line summary"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Select
            label="Cliente"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            options={[{ value: '', label: '— Selecciona un cliente —' }, ...clientOptions]}
          />
          <Select
            label="Moneda"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as 'COP' | 'USD')}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          />
        </div>

        <div className="rounded-card border border-border bg-bg-alt px-3.5 py-3">
          <Eyebrow className="mb-2">¿Cliente nuevo?</Eyebrow>
          <div className="flex items-center gap-2">
            <input
              placeholder="Nombre del cliente"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              className="flex-1 h-8 px-3 rounded-md bg-surface-2 border border-border text-[13px] text-text placeholder:text-text-dim focus:border-border-strong outline-none"
            />
            <Button variant="secondary" size="sm" onClick={createClient} disabled={creatingClient}>
              {creatingClient ? '…' : '+ Crear'}
            </Button>
          </div>
        </div>

        {error && <div className="text-[12px] text-danger">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={submitting}>
              Cancelar
            </Button>
          )}
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Creando…' : 'Crear proyecto'}
          </Button>
        </div>
      </Stack>
    </Card>
  )
}
