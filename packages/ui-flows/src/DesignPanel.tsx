import type { ApiClient } from '@tortuga-os/api-client'
import type { DesignFrameDTO, StoryDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
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

/**
 * F3 design surface for a story: import a Figma link or generate a design
 * from intent, then review the imported frames with their baseline preview,
 * extracted tokens, and the latest pixel-fidelity score against the
 * implemented screen.
 */
export function DesignPanel({ client, projectCode, stories }: DesignPanelProps) {
  const [storyId, setStoryId] = useState<string>(stories[0]?.id ?? '')
  const [figmaUrl, setFigmaUrl] = useState('')
  const [intent, setIntent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const { data: frames } = useAsyncData(
    () => (storyId ? client.designFrames.listForStory(storyId) : Promise.resolve([])),
    [client, storyId, refreshKey],
  )

  async function runImport() {
    if (!storyId || !figmaUrl.trim()) {
      setError('Elige una historia y pega un link de Figma')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await client.designFrames.import({ storyId, figmaUrl: figmaUrl.trim() })
      setFigmaUrl('')
      setNotice(
        'Import encolado. El agente designer extraerá los frames; refresca en unos segundos.',
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function runGenerate() {
    if (!storyId || !intent.trim()) {
      setError('Elige una historia y describe la pantalla a generar')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await client.designFrames.generate({ storyId, intent: intent.trim() })
      setIntent('')
      setNotice('Generación encolada. El agente designer creará el diseño en Figma.')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
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

  return (
    <Card>
      <div>
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
          Diseño (F3) — Figma
        </h3>
        <div className="text-[12px] text-text-muted mt-1">
          Importa un Figma o genera uno desde una descripción. Los tokens y el frame se vuelven la
          base contra la que el dev implementa y el gate de fidelidad compara pixel a pixel.
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="design-story-select"
          className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1"
        >
          Historia
        </label>
        <select
          id="design-story-select"
          className="w-full bg-bg border border-border rounded-md px-3 py-2 text-[13px] text-text focus:outline-none focus:border-brand"
          value={storyId}
          onChange={(e) => {
            setStoryId(e.target.value)
            setRefreshKey((k) => k + 1)
          }}
        >
          {stories.length === 0 && <option value="">Sin historias</option>}
          {stories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.title}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border bg-bg/30 p-3">
          <Eyebrow>Importar Figma</Eyebrow>
          <div className="mt-2">
            <TextField
              label="Link de Figma"
              placeholder="https://figma.com/design/KEY/...?node-id=10-20"
              value={figmaUrl}
              onChange={(e) => setFigmaUrl(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="turtle" onClick={runImport} disabled={busy}>
              {busy ? '…' : 'Importar'}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-bg/30 p-3">
          <Eyebrow>Generar desde intent</Eyebrow>
          <div className="mt-2">
            <textarea
              className="w-full bg-bg border border-border rounded-md px-3 py-2 text-[12px] text-text leading-snug min-h-[64px] focus:outline-none focus:border-brand"
              placeholder="Pantalla de login con email + contraseña, branding Tuurt."
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="turtle" onClick={runGenerate} disabled={busy}>
              {busy ? '…' : 'Generar'}
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      {notice && <div className="mt-2 text-[12px] text-text-muted">{notice}</div>}

      <div className="mt-5 border-t border-border pt-3">
        <div className="flex items-center justify-between">
          <Eyebrow>Frames ({frames?.length ?? 0})</Eyebrow>
          <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
            ↻ Refrescar
          </Button>
        </div>
        {frames && frames.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">
            Sin frames aún. Importa un Figma o genera uno.
          </div>
        )}
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {frames?.map((f) => {
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
                  <span className="text-[10px] font-mono text-text-dim truncate">
                    {f.figmaNodeId}
                  </span>
                </div>
                {f.status !== 'approved' && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => approve(f)}>
                      Aprobar diseño
                    </Button>
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
