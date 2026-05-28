import type { ApiClient } from '@tortuga-os/api-client'
import type { SecretDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface SecretsPanelProps {
  client: ApiClient
  projectCode: string
}

/**
 * Per-project secret manager. Plaintext values are AES-256-GCM
 * encrypted by the sidecar (key derived from the handshake token).
 * Secrets are injected as env vars into every agent run for this
 * project — name them in SHOUT_CASE so the agent can reference them
 * naturally (FIGMA_API_KEY, SUPABASE_SERVICE_ROLE_KEY, etc.).
 */
export function SecretsPanel({ client, projectCode }: SecretsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, loading } = useAsyncData(
    () => client.secrets.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )

  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function add() {
    if (!name.trim() || !value) {
      setSubmitError('Nombre y valor son obligatorios')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.secrets.create({
        projectCode,
        name: name.trim().toUpperCase(),
        value,
        description: description.trim() || undefined,
      })
      setName('')
      setValue('')
      setDescription('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function reveal(s: SecretDTO) {
    try {
      const result = await client.secrets.reveal(s.id)
      // Native prompt is fine for a v1 — copy/paste UX without
      // touching the clipboard API (which is gated in Tauri).
      prompt(`Valor de ${result.name} (copia con Ctrl+C):`, result.value)
    } catch (err) {
      setSubmitError((err as Error).message)
    }
  }

  async function remove(s: SecretDTO) {
    if (!confirm(`Eliminar secret "${s.name}"? Los próximos agent runs no lo recibirán.`)) return
    try {
      await client.secrets.remove(s.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    }
  }

  return (
    <Card>
      <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
        Credenciales del proyecto
      </h3>
      <div className="text-[12px] text-text-muted mt-1">
        Cifrados en DB (AES-256-GCM) e inyectados como env vars en cada agent run de este proyecto.
        Usa nombres SHOUT_CASE.
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <Eyebrow>Nuevo secret</Eyebrow>
        <div className="mt-2">
          <TextField
            label="Nombre (SHOUT_CASE)"
            placeholder="FIGMA_API_KEY"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            disabled={submitting}
          />
        </div>
        <div className="mt-2">
          <TextField
            label="Valor"
            type="password"
            placeholder="fk_xxx..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="mt-2">
          <TextField
            label="Descripción (opcional)"
            placeholder="API key de Figma para el design agent"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>
        {submitError && <div className="mt-2 text-[12px] text-danger">{submitError}</div>}
        <div className="mt-3 flex justify-end">
          <Button variant="turtle" onClick={add} disabled={submitting}>
            {submitting ? '…' : '+ Guardar cifrado'}
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-3">
        <Eyebrow>Credenciales configuradas ({data?.length ?? 0})</Eyebrow>
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">Sin credenciales aún.</div>
        )}
        <div className="mt-2 space-y-1.5">
          {data?.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-md border border-border bg-bg/30 px-3 py-2 gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-mono font-medium">{s.name}</span>
                  <Badge tone={s.hasValue ? 'turtle' : 'warning'} outline>
                    {s.hasValue ? 'cifrado' : 'vacío'}
                  </Badge>
                </div>
                {s.description && (
                  <div className="text-[11px] text-text-muted">{s.description}</div>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => reveal(s)} title="Revelar valor">
                👁
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                ✗
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
