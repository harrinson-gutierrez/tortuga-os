import type { ApiClient } from '@tortuga-os/api-client'
import type { KitTemplateDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface KitTemplatesPanelProps {
  client: ApiClient
  onClose?: () => void
}

/**
 * Manage reusable project snapshots ("kits"). A kit captures the
 * stories + modules + milestones of a typical service so the operator
 * can spin up similar future projects pre-populated. Supports CRUD on
 * the kit metadata plus instantiating a kit into an existing project's
 * draft quote (seeds stories + modules + milestones).
 */
export function KitTemplatesPanel({ client, onClose }: KitTemplatesPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, loading } = useAsyncData(
    () => client.kitTemplates.list(),
    [client, refreshKey],
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [stack, setStack] = useState('flutter-supabase')
  const [snapshotJson, setSnapshotJson] = useState(
    JSON.stringify(
      {
        stories: [],
        modules: [],
        milestones: [],
      },
      null,
      2,
    ),
  )
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function add() {
    if (!name.trim()) {
      setSubmitError('Nombre requerido')
      return
    }
    let snapshot: unknown = {}
    try {
      snapshot = JSON.parse(snapshotJson)
    } catch (err) {
      setSubmitError(`Snapshot JSON inválido: ${(err as Error).message}`)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.kitTemplates.create({
        name: name.trim(),
        description: description.trim() || undefined,
        stack: stack.trim() || 'unknown',
        snapshot: snapshot as never,
      })
      setName('')
      setDescription('')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(k: KitTemplateDTO) {
    if (!confirm(`Eliminar kit "${k.name}"? (soft-delete)`)) return
    try {
      await client.kitTemplates.remove(k.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setSubmitError((err as Error).message)
    }
  }

  async function instantiate(k: KitTemplateDTO) {
    const projectCode = prompt(
      `¿En qué proyecto instalar el kit "${k.name}"?\nEscribe el código del proyecto (ej. GASTUU).`,
    )?.trim()
    if (!projectCode) return
    setSubmitError(null)
    try {
      const r = await client.kitTemplates.instantiate(k.id, projectCode)
      alert(
        `Kit aplicado a ${r.projectCode}: ${r.storiesCreated} stories, ${r.modulesCreated} módulos, ${r.milestonesCreated} milestones.`,
      )
    } catch (err) {
      setSubmitError((err as Error).message)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
            Kits (plantillas de proyecto)
          </h3>
          <div className="text-[12px] text-text-muted mt-1">
            Snapshots reutilizables de scope: stories + módulos + milestones que se aplican al crear
            un nuevo proyecto similar.
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <Eyebrow>Nuevo kit</Eyebrow>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TextField
            label="Nombre"
            placeholder="App móvil con Auth + CRUD"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
          <TextField
            label="Stack"
            placeholder="flutter-supabase"
            value={stack}
            onChange={(e) => setStack(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="mt-2">
          <TextField
            label="Descripción"
            placeholder="Plantilla típica para servicios CRUD móviles."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="mt-2">
          <label
            htmlFor="kit-template-snapshot-json"
            className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1"
          >
            Snapshot (JSON: stories / modules / milestones)
          </label>
          <textarea
            id="kit-template-snapshot-json"
            className="w-full bg-bg border border-border rounded-md px-3 py-2 text-[11px] text-text font-mono leading-snug min-h-[160px] focus:outline-none focus:border-brand"
            value={snapshotJson}
            onChange={(e) => setSnapshotJson(e.target.value)}
            disabled={submitting}
          />
        </div>
        {submitError && <div className="mt-2 text-[12px] text-danger">{submitError}</div>}
        <div className="mt-3 flex justify-end">
          <Button variant="turtle" onClick={add} disabled={submitting}>
            {submitting ? '…' : '+ Guardar kit'}
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-3">
        <Eyebrow>Kits guardados ({data?.length ?? 0})</Eyebrow>
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">Aún no hay kits guardados.</div>
        )}
        <div className="mt-2 space-y-1.5">
          {data?.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-md border border-border bg-bg/30 px-3 py-2 gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">{k.name}</span>
                  <Badge tone="neutral" outline>
                    {k.stack}
                  </Badge>
                </div>
                {k.description && (
                  <div className="text-[11px] text-text-muted">{k.description}</div>
                )}
                <div className="text-[10px] font-mono text-text-dim mt-0.5">
                  {k.snapshot.stories?.length ?? 0} stories · {k.snapshot.modules?.length ?? 0}{' '}
                  módulos · {k.snapshot.milestones?.length ?? 0} milestones
                </div>
              </div>
              <Button size="sm" variant="turtle" onClick={() => instantiate(k)}>
                Usar en proyecto
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(k)}>
                ✗
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
