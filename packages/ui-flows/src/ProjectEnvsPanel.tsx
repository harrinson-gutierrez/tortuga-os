import type { ApiClient } from '@tortuga-os/api-client'
import type { ProjectEnvDTO, ProjectEnvironment } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface ProjectEnvsPanelProps {
  client: ApiClient
  projectCode: string
}

const ENVIRONMENTS: ReadonlyArray<{ value: ProjectEnvironment; label: string }> = [
  { value: 'dev', label: 'Dev' },
  { value: 'staging', label: 'Staging' },
  { value: 'prod', label: 'Prod' },
]

const NAME_RE = /^[A-Z][A-Z0-9_]*$/

/**
 * Per-project NON-SECRET env vars scoped by environment (dev/staging/prod).
 * Useful for public URLs, feature flags, public IDs. For API keys and
 * tokens use the SecretsPanel — those land encrypted at rest.
 */
export function ProjectEnvsPanel({ client, projectCode }: ProjectEnvsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [environment, setEnvironment] = useState<ProjectEnvironment>('dev')
  const { data, error, loading } = useAsyncData(
    () => client.projectEnvs.listForProject(projectCode, environment),
    [client, projectCode, environment, refreshKey],
  )

  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editDescription, setEditDescription] = useState('')

  async function add() {
    const trimmedName = name.trim().toUpperCase()
    if (!trimmedName) {
      setSubmitError('Nombre obligatorio')
      return
    }
    if (!NAME_RE.test(trimmedName)) {
      setSubmitError('Nombre debe matchear /^[A-Z][A-Z0-9_]*$/')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.projectEnvs.create(projectCode, {
        environment,
        name: trimmedName,
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

  function startEdit(e: ProjectEnvDTO) {
    setEditingId(e.id)
    setEditValue(e.value)
    setEditDescription(e.description ?? '')
    setSubmitError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
    setEditDescription('')
  }

  async function saveEdit(e: ProjectEnvDTO) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.projectEnvs.patch(e.id, {
        value: editValue,
        description: editDescription.trim() ? editDescription.trim() : null,
      })
      cancelEdit()
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(e: ProjectEnvDTO) {
    if (!confirm(`Eliminar variable "${e.name}" de ${environment}?`)) return
    try {
      await client.projectEnvs.remove(e.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    }
  }

  return (
    <Card>
      <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
        Variables de entorno
      </h3>
      <div className="text-[12px] text-text-muted mt-1">
        Valores sin cifrar por entorno (dev / staging / prod). Para llaves secretas usa el panel de
        credenciales.
      </div>

      <div className="mt-4 flex gap-1.5 border-b border-border pb-3">
        {ENVIRONMENTS.map((env) => (
          <button
            type="button"
            key={env.value}
            onClick={() => setEnvironment(env.value)}
            className={`px-3 h-7 rounded-md text-[12px] font-mono uppercase tracking-eyebrow transition-colors ${
              environment === env.value
                ? 'bg-surface border border-border-strong text-text'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {env.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <Eyebrow>Nueva variable ({environment})</Eyebrow>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TextField
            label="Nombre (SHOUT_CASE)"
            placeholder="API_BASE_URL"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            disabled={submitting}
          />
          <TextField
            label="Valor"
            placeholder="https://api.staging.example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="mt-2">
          <TextField
            label="Descripción (opcional)"
            placeholder="URL pública del API"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>
        {submitError && <div className="mt-2 text-[12px] text-danger">{submitError}</div>}
        <div className="mt-3 flex justify-end">
          <Button onClick={add} disabled={submitting}>
            {submitting ? '…' : '+ Guardar'}
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-3">
        <Eyebrow>
          Variables en {environment} ({data?.length ?? 0})
        </Eyebrow>
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">
            Sin variables en {environment} todavía.
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {data?.map((e) => {
            const editing = editingId === e.id
            return (
              <div key={e.id} className="rounded-md border border-border bg-bg/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-mono font-medium">{e.name}</span>
                      <Badge tone="neutral" outline>
                        {e.environment}
                      </Badge>
                    </div>
                    {!editing && (
                      <div className="mt-1 text-[12px] font-mono text-text-muted truncate">
                        {e.value}
                      </div>
                    )}
                    {!editing && e.description && (
                      <div className="text-[11px] text-text-dim">{e.description}</div>
                    )}
                  </div>
                  {!editing && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(e)} title="Editar">
                        ✎
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(e)} title="Eliminar">
                        ✗
                      </Button>
                    </>
                  )}
                </div>
                {editing && (
                  <div className="mt-2 space-y-2">
                    <TextField
                      label="Valor"
                      value={editValue}
                      onChange={(ev) => setEditValue(ev.target.value)}
                      disabled={submitting}
                    />
                    <TextField
                      label="Descripción"
                      value={editDescription}
                      onChange={(ev) => setEditDescription(ev.target.value)}
                      disabled={submitting}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={submitting}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(e)} disabled={submitting}>
                        Guardar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
