import type { ApiClient } from '@tortuga-os/api-client'
import { Badge, Button, Card, Eyebrow, Select } from '@tortuga-os/ui'
import { useMemo, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface ScaffoldPanelProps {
  client: ApiClient
  projectCode: string
  /** Called when the scaffold finishes successfully. */
  onDone?: () => void
  /**
   * Called when the operator wants to mark the arch task as approved
   * (the scaffold ran successfully and `flutter analyze` is clean).
   * If undefined the panel only refreshes via onDone and leaves the
   * task in its current status.
   */
  onApproveTask?: () => Promise<void> | void
}

interface StepState {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  log: string
}

/**
 * Two-step scaffold flow:
 *   step 1: pick a stack → see exactly what will be created (preview)
 *   step 2: click "Crear scaffold" → progress streams in
 *
 * No LLM involved. The sidecar runs the canonical scaffold command and
 * writes a curated set of files from JSON templates. Same output every
 * time, no hallucinations, no permission prompts.
 */
export function ScaffoldPanel({ client, projectCode, onDone, onApproveTask }: ScaffoldPanelProps) {
  const templates = useAsyncData(() => client.scaffold.listTemplates(), [client])
  const [stack, setStack] = useState<string>('flutter-supabase')
  const preview = useAsyncData(
    () => client.scaffold.preview(projectCode, stack),
    [client, projectCode, stack],
  )

  // Detect whether the scaffold has already run by looking for
  // ARCHITECTURE.md in the workspace. If it's there, the operator only
  // needs to approve the task, not re-run the scaffold.
  const archCheck = useAsyncData(
    () =>
      client.workspace
        .readFile(projectCode, 'ARCHITECTURE.md')
        .then(() => ({ exists: true }))
        .catch(() => ({ exists: false })),
    [client, projectCode],
  )
  const alreadyScaffolded = archCheck.data?.exists === true

  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>([])
  const [createdFiles, setCreatedFiles] = useState<string[]>([])

  const stepIndex = useMemo(() => {
    const m = new Map<string, number>()
    steps.forEach((s, i) => m.set(s.id, i))
    return m
  }, [steps])

  function upsertStep(id: string, patch: Partial<StepState>) {
    setSteps((prev) => {
      const idx = stepIndex.get(id)
      if (idx !== undefined) {
        const next = [...prev]
        next[idx] = { ...next[idx]!, ...patch } as StepState
        return next
      }
      return [
        ...prev,
        {
          id,
          label: patch.label ?? id,
          status: patch.status ?? 'pending',
          log: patch.log ?? '',
        },
      ]
    })
  }

  async function start() {
    if (!preview.data) return
    setRunning(true)
    setDone(false)
    setError(null)
    setCreatedFiles([])
    // Seed steps from the preview so the user sees the full plan upfront.
    setSteps([
      ...preview.data.steps.map((s) => ({
        id: s.id,
        label: s.label,
        status: 'pending' as const,
        log: '',
      })),
      ...preview.data.verify.map((v) => ({
        id: v.id,
        label: v.label,
        status: 'pending' as const,
        log: '',
      })),
    ])

    try {
      await client.scaffold.run(projectCode, stack, {
        onStepStart: (id, label) => upsertStep(id, { label, status: 'running' }),
        onStepOutput: (id, text) => {
          setSteps((prev) => {
            const idx = prev.findIndex((s) => s.id === id)
            if (idx < 0) return prev
            const next = [...prev]
            const tail = (next[idx]!.log + text).slice(-2000) // cap memory
            next[idx] = { ...next[idx]!, log: tail }
            return next
          })
        },
        onStepEnd: (id, exitCode) => upsertStep(id, { status: exitCode === 0 ? 'done' : 'failed' }),
        onFile: (to) => setCreatedFiles((prev) => [...prev, to]),
        onDone: () => {
          setDone(true)
          onDone?.()
        },
        onError: (stepId, message) => {
          setError(message)
          if (stepId) upsertStep(stepId, { status: 'failed' })
        },
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <Eyebrow>Scaffold del proyecto</Eyebrow>
      <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0 mt-1">
        Crea el esqueleto del proyecto
      </h3>
      <div className="mt-1 text-[12px] text-text-muted">
        Plantilla determinista (sin LLM). Mismo output siempre, sin permisos que aprobar.
      </div>

      {/* Already-done state: scaffold ran in a previous session. */}
      {alreadyScaffolded && !running && !done && (
        <AlreadyDoneBanner
          onForceRerun={() => {
            setDone(false)
            setRunning(false)
            setError(null)
            setSteps([])
            setCreatedFiles([])
            void archCheck.refetch()
          }}
          onApproveTask={onApproveTask}
        />
      )}

      {/* Step 1: select + preview (only when not yet scaffolded). */}
      {!alreadyScaffolded && !running && !done && (
        <div className="mt-4">
          {templates.data && (
            <Select
              label="Plantilla"
              value={stack}
              onChange={(e) => setStack(e.target.value)}
              options={templates.data.templates.map((t) => ({
                value: t.stack,
                label: `${t.displayName} — ${t.description}`,
              }))}
            />
          )}

          {preview.data && (
            <div className="mt-4 rounded-md border border-border bg-bg-alt p-3 space-y-3">
              <div>
                <div className="text-[11px] text-text-muted uppercase tracking-eyebrow">
                  Pasos a ejecutar
                </div>
                <ul className="mt-2 space-y-1">
                  {preview.data.steps.map((s) => (
                    <li key={s.id} className="text-[12px] font-mono text-text-soft">
                      • {s.label}
                      <div className="ml-3 text-[11px] text-text-muted">{s.cmd}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-[11px] text-text-muted uppercase tracking-eyebrow">
                  Archivos que se van a crear
                </div>
                <ul className="mt-2 space-y-0.5">
                  {preview.data.files.map((f) => (
                    <li key={f.to} className="text-[11px] font-mono text-text-soft truncate">
                      📄 {f.to}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-[11px] text-text-muted uppercase tracking-eyebrow">
                  Verificación
                </div>
                <ul className="mt-2 space-y-1">
                  {preview.data.verify.map((v) => (
                    <li key={v.id} className="text-[12px] font-mono text-text-soft">
                      • {v.label}
                      <div className="ml-3 text-[11px] text-text-muted">{v.cmd}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

          <div className="mt-4 flex justify-end">
            <Button variant="turtle" onClick={start} disabled={!preview.data}>
              ▶ Crear scaffold
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: progress */}
      {(running || done) && (
        <div className="mt-4 space-y-3">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}

          {createdFiles.length > 0 && (
            <div className="rounded-md border border-turtle/40 bg-turtle/5 p-3">
              <div className="text-[12px] text-turtle">
                ✓ Archivos creados ({createdFiles.length}):
              </div>
              <ul className="mt-1 ml-4 list-disc">
                {createdFiles.slice(0, 12).map((f) => (
                  <li key={f} className="text-[11px] font-mono text-text-soft">
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <div className="text-[12px] text-danger">{error}</div>}

          {done && (
            <div className="rounded-md border border-turtle/40 bg-turtle/5 p-4">
              <div className="text-[14px] text-turtle font-medium">✓ Scaffold completo</div>
              <div className="mt-1 text-[12px] text-text-soft">
                El proyecto compila y <code>ARCHITECTURE.md</code> ya describe las decisiones.
                Aprueba esta tarea para desbloquear las features.
              </div>
              {onApproveTask && (
                <div className="mt-3 flex justify-end">
                  <ApproveButton onApprove={onApproveTask} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function AlreadyDoneBanner({
  onForceRerun,
  onApproveTask,
}: {
  onForceRerun: () => void
  onApproveTask?: () => Promise<void> | void
}) {
  return (
    <div className="mt-4 rounded-md border border-turtle/40 bg-turtle/5 p-4">
      <div className="text-[14px] text-turtle font-medium">✓ Scaffold ya ejecutado</div>
      <div className="mt-1 text-[12px] text-text-soft">
        El esqueleto del proyecto y <code>ARCHITECTURE.md</code> ya existen en disco. No necesitas
        correr el scaffold otra vez. Aprueba esta tarea para desbloquear las siguientes features.
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onForceRerun}>
          Forzar nuevo scaffold
        </Button>
        {onApproveTask && <ApproveButton onApprove={onApproveTask} />}
      </div>
    </div>
  )
}

function ApproveButton({
  onApprove,
}: {
  onApprove: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="turtle"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onApprove()
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? 'Aprobando…' : '✓ Aprobar arquitectura'}
    </Button>
  )
}

function StepRow({ step }: { step: StepState }) {
  const tone =
    step.status === 'done'
      ? 'turtle'
      : step.status === 'running'
        ? 'brand'
        : step.status === 'failed'
          ? 'danger'
          : 'neutral'
  const icon =
    step.status === 'done'
      ? '✓'
      : step.status === 'running'
        ? '…'
        : step.status === 'failed'
          ? '✗'
          : '○'
  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <div className="flex items-center gap-2">
        <Badge tone={tone} outline>
          {icon}
        </Badge>
        <span className="text-[13px] text-text">{step.label}</span>
      </div>
      {step.log && (
        <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap text-text-soft max-h-[160px] overflow-y-auto m-0">
          {step.log}
        </pre>
      )}
    </div>
  )
}
