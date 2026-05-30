import type { ApiClient } from '@tortuga-os/api-client'
import type { DesignFrameDTO, StoryDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { CoworkerLiveView } from './ScaffoldPanel'
import { useAsyncData } from './useAsyncData'

export interface DesignPanelProps {
  client: ApiClient
  projectCode: string
  stories: StoryDTO[]
}

/** Map the stored fidelity % onto the double-threshold color/label. */
function fidelityTone(pct: number | null): {
  tone: 'turtle' | 'warning' | 'danger' | 'neutral'
  label: string
} {
  if (pct === null) return { tone: 'neutral', label: 'sin medir' }
  if (pct < 2) return { tone: 'turtle', label: `${pct}% · fiel` }
  if (pct <= 8) return { tone: 'warning', label: `${pct}% · revisar` }
  return { tone: 'danger', label: `${pct}% · no coincide` }
}

/** Build stories only (exclude the synthetic -000 / -000-DESIGN holders). */
function isBuildStory(code: string): boolean {
  return !code.endsWith('-000') && !code.endsWith('-000-DESIGN')
}

/**
 * F3 design surface at the PROJECT level: import one Figma (the whole
 * product) or generate it from intent. Frames land in a pool and the
 * frame-assigner distributes them to build stories; the operator can
 * reassign any frame manually. Each frame shows its baseline preview and
 * the latest pixel-fidelity score against the implemented screen.
 */
export function DesignPanel({ client, projectCode, stories }: DesignPanelProps) {
  const [figmaUrl, setFigmaUrl] = useState('')
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: frames } = useAsyncData(
    () => client.designFrames.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )

  // Pre-flight: the designer can only read/write Figma through the project's
  // Figma MCP. If it isn't installed + enabled, the run would fail silently,
  // so we block import/generate and point the operator to the MCP panel.
  const { data: mcps } = useAsyncData(
    () => client.projectMcps.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )
  const figmaReady = (mcps ?? []).some(
    (m) => m.enabled && (m.presetId === 'figma' || m.name === 'figma'),
  )

  const buildStories = stories.filter((s) => isBuildStory(s.code))
  const storyById = new Map(stories.map((s) => [s.id, s]))
  const pool = (frames ?? []).filter((f) => f.storyId === null)
  const assigned = (frames ?? []).filter((f) => f.storyId !== null)

  async function runImport() {
    if (!figmaUrl.trim()) {
      setError('Pega un link de Figma del proyecto')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { runId } = await client.designFrames.import({ projectCode, figmaUrl: figmaUrl.trim() })
      setFigmaUrl('')
      setActiveRunId(runId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function runGenerate() {
    if (!intent.trim()) {
      setError('Describe el producto a diseñar')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { runId } = await client.designFrames.generate({ projectCode, intent: intent.trim() })
      setIntent('')
      setActiveRunId(runId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function reassign(frame: DesignFrameDTO, storyId: string | null) {
    setError(null)
    try {
      await client.designFrames.assign(frame.id, storyId)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function approve(frame: DesignFrameDTO) {
    setError(null)
    try {
      await client.designFrames.approve(frame.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function frameCard(f: DesignFrameDTO) {
    const fid = fidelityTone(f.fidelityPct)
    return (
      <div key={f.id} className="rounded-md border border-border bg-bg/30 p-2">
        {f.baselineScreenshotPath && (
          <img
            src={client.workspace.rawUrl(projectCode, f.baselineScreenshotPath)}
            alt={f.name}
            className="w-full rounded-sm border border-border mb-2 object-cover max-h-48"
          />
        )}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[13px] font-medium truncate">{f.name}</span>
          <Badge tone={f.status === 'approved' ? 'turtle' : 'neutral'} outline>
            {f.status}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <Badge tone={fid.tone} outline>
            {fid.label}
          </Badge>
          <span className="text-[10px] font-mono text-text-dim truncate">{f.figmaNodeId}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select
            className="flex-1 bg-bg border border-border rounded-md px-2 py-1 text-[12px] text-text focus:outline-none focus:border-brand"
            value={f.storyId ?? ''}
            onChange={(e) => reassign(f, e.target.value || null)}
          >
            <option value="">— Sin asignar (pool) —</option>
            {buildStories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.title}
              </option>
            ))}
          </select>
          {f.status !== 'approved' && (
            <Button size="sm" variant="ghost" onClick={() => approve(f)} title="Aprobar diseño">
              ✓
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <Card>
      <div>
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
          Diseño del proyecto (F3) — Figma
        </h3>
        <div className="text-[12px] text-text-muted mt-1">
          Primera tarea del proyecto, antes de arquitectura. Importa el Figma del proyecto entero o
          genéralo desde una descripción: el agente diseñador trae cada pantalla, el repartidor la
          asigna a su historia, y al programar el gate de fidelidad compara pixel a pixel contra ese
          diseño.
        </div>
      </div>

      {mcps && !figmaReady && (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-[12px] text-text">
          Falta el <span className="font-medium">MCP de Figma</span> en este proyecto. Sin él, el
          agente no puede leer ni crear en Figma. Instálalo en la pestaña{' '}
          <span className="font-medium">Conexiones MCP</span> y vuelve aquí.
        </div>
      )}

      {activeRunId && (
        <div className="mt-4">
          <Eyebrow>Agente diseñador trabajando…</Eyebrow>
          <div className="mt-2">
            <CoworkerLiveView
              client={client}
              runId={activeRunId}
              onFinished={() => {
                setActiveRunId(null)
                setRefreshKey((k) => k + 1)
              }}
            />
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-bg/30 p-3">
          <Eyebrow>Importar Figma del proyecto</Eyebrow>
          <div className="mt-2">
            <TextField
              label="Link de Figma"
              placeholder="https://figma.com/design/KEY/... (todo el archivo)"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              disabled={busy || !figmaReady || !!activeRunId}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="turtle"
              onClick={runImport}
              disabled={busy || !figmaReady || !!activeRunId}
            >
              {busy ? '…' : 'Importar'}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-bg/30 p-3">
          <Eyebrow>Generar desde intent</Eyebrow>
          <div className="mt-2">
            <textarea
              className="w-full bg-bg border border-border rounded-md px-3 py-2 text-[12px] text-text leading-snug min-h-[64px] focus:outline-none focus:border-brand"
              placeholder="App de gestión de flota: login, dashboard, detalle de vehículo, perfil. Branding Tuurt."
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              disabled={busy || !figmaReady || !!activeRunId}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="turtle"
              onClick={runGenerate}
              disabled={busy || !figmaReady || !!activeRunId}
            >
              {busy ? '…' : 'Generar'}
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}

      <div className="mt-5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <Eyebrow>Pool sin asignar ({pool.length})</Eyebrow>
          <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
            ↻ Refrescar
          </Button>
        </div>
        {frames && pool.length === 0 && (
          <div className="text-[12px] text-text-muted py-2">
            Nada en el pool. Importa un Figma o ya está todo repartido.
          </div>
        )}
        <div className="mt-2 grid gap-2 md:grid-cols-2">{pool.map(frameCard)}</div>
      </div>

      <div className="mt-5 border-t border-border pt-3">
        <Eyebrow>Asignados a historias ({assigned.length})</Eyebrow>
        <div className="mt-2 space-y-3">
          {buildStories.map((s) => {
            const sframes = assigned.filter((f) => f.storyId === s.id)
            if (sframes.length === 0) return null
            return (
              <div key={s.id}>
                <div className="text-[11px] font-mono text-text-dim mb-1">
                  {s.code} — {s.title}
                </div>
                <div className="grid gap-2 md:grid-cols-2">{sframes.map(frameCard)}</div>
              </div>
            )
          })}
          {assigned.some((f) => f.storyId && !storyById.has(f.storyId)) && (
            <div className="text-[11px] text-text-muted">
              Hay frames asignados a historias que ya no existen — reasígnalos desde el pool.
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
