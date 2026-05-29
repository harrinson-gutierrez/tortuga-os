import type { ApiClient } from '@tortuga-os/api-client'
import type { AgentRunDTO } from '@tortuga-os/contracts'

type ScaffoldHistoryRun = {
  id: string
  stack: string
  startedAt: number
  finishedAt: number | null
  steps: Array<{
    id: string
    label: string
    status: 'pending' | 'running' | 'done' | 'failed'
    log: string
    exitCode: number | null
  }>
  createdFiles: string[]
  outcome: 'succeeded' | 'failed'
  error: string | null
}
import { Badge, Button, Card, Eyebrow, Select } from '@tortuga-os/ui'
import { useEffect, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface ScaffoldPanelProps {
  client: ApiClient
  projectCode: string
  /** Task id that owns this scaffold run. Required for the "Recrear con
   * agente" path, which queues an agent run scoped to this task's
   * current iteration. */
  taskId?: string
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

export function ScaffoldPanel({
  client,
  projectCode,
  taskId,
  onDone,
  onApproveTask,
}: ScaffoldPanelProps) {
  const templates = useAsyncData(() => client.scaffold.listTemplates(), [client])
  const [stack, setStack] = useState<string>('flutter-supabase')
  const preview = useAsyncData(
    () => client.scaffold.preview(projectCode, stack),
    [client, projectCode, stack],
  )

  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<StepState[]>([])
  const [createdFiles, setCreatedFiles] = useState<string[]>([])
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [agentRecreating, setAgentRecreating] = useState(false)
  const [coworkerRunId, setCoworkerRunId] = useState<string | null>(null)
  const [history, setHistory] = useState<ScaffoldHistoryRun[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per (client, projectCode)
  useEffect(() => {
    let alive = true
    void client.scaffold
      .history(projectCode)
      .then((h) => {
        if (!alive) return
        const runs = h.runs ?? []
        setHistory(runs)
        const last = runs[runs.length - 1]
        if (last && steps.length === 0 && !running) {
          setSteps(
            last.steps.map((s) => ({
              id: s.id,
              label: s.label,
              status: s.status,
              log: s.log,
            })),
          )
          setCreatedFiles(last.createdFiles)
          setError(last.error)
          setDone(last.outcome === 'succeeded')
          setFailedAttempts(last.outcome === 'failed' ? 1 : 0)
        }
      })
      .catch(() => {
        /* no history yet — first run */
      })
      .finally(() => {
        if (alive) setHistoryLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [client, projectCode])

  function upsertStep(id: string, patch: Partial<StepState>) {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s?.id === id)
      if (idx >= 0) {
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
      console.log('[scaffold] starting run', { projectCode, stack })
      await client.scaffold.run(projectCode, stack, {
        onStepStart: (id, label) => {
          console.log('[scaffold] step-start', id, label)
          upsertStep(id, { label, status: 'running' })
        },
        onStepOutput: (id, text) => {
          setSteps((prev) => {
            const idx = prev.findIndex((s) => s.id === id)
            if (idx < 0) return prev
            const next = [...prev]
            const tail = (next[idx]!.log + text).slice(-2000)
            next[idx] = { ...next[idx]!, log: tail }
            return next
          })
        },
        onStepEnd: (id, exitCode) => {
          console.log('[scaffold] step-end', id, 'exit=', exitCode)
          upsertStep(id, { status: exitCode === 0 ? 'done' : 'failed' })
        },
        onFile: (to) => {
          console.log('[scaffold] file', to)
          setCreatedFiles((prev) => [...prev, to])
        },
        onDone: () => {
          console.log('[scaffold] DONE — calling onDone callback', { hasCallback: !!onDone })
          setDone(true)
          onDone?.()
        },
        onError: (stepId, message) => {
          console.log('[scaffold] ERROR', { stepId, message })
          setError(message)
          if (stepId) upsertStep(stepId, { status: 'failed' })
        },
      })
      console.log('[scaffold] run() promise resolved — stream closed')
    } catch (e) {
      console.log('[scaffold] run() threw', e)
      setError((e as Error).message)
    } finally {
      console.log('[scaffold] finally — setRunning(false)')
      setRunning(false)
      setSteps((prev) => {
        const anyFailed = prev.some((s) => s.status === 'failed')
        if (anyFailed) {
          setFailedAttempts((n) => n + 1)
        } else if (prev.length > 0 && prev.every((s) => s.status === 'done')) {
          setFailedAttempts(0)
        }
        return prev
      })
      void client.scaffold
        .history(projectCode)
        .then((h) => setHistory(h.runs ?? []))
        .catch(() => {})
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

      {/* Step 1: select + preview. Shows when no run is in progress and
          we don't have steps to display yet. */}
      {!running && !done && steps.length === 0 && (
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

      {/* Step 2: progress. Steps stay visible after the run finishes
          (success or failure) so the operator keeps the history. */}
      {steps.length > 0 && (
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

          {(() => {
            const failedSteps = steps.filter((s) => s.status === 'failed')
            const hasFailure = failedSteps.length > 0 || !!error
            const finished = done || (!running && steps.length > 0)

            if (running) return null
            if (!finished) return null

            if (hasFailure) {
              const showAgentRecreate = true
              return (
                <div className="rounded-md border border-danger/40 bg-danger/5 p-4">
                  <div className="text-[14px] text-danger font-medium">
                    ✗ Scaffold con errores ({failedSteps.length || 1})
                  </div>
                  <div className="mt-1 text-[12px] text-text-soft">
                    {error ?? `Falló: ${failedSteps.map((s) => s.label).join(', ')}.`}
                    {failedAttempts > 0 && (
                      <span className="text-text-muted ml-1">
                        (intentos fallidos: {failedAttempts})
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" onClick={start} disabled={agentRecreating}>
                      Reintentar manual
                    </Button>
                    {!taskId && (
                      <div className="text-[11px] text-warning">
                        ⚠ taskId ausente — el botón de agente requiere taskId.
                      </div>
                    )}
                    {showAgentRecreate && taskId && (
                      <Button
                        size="sm"
                        variant="turtle"
                        disabled={agentRecreating}
                        onClick={async () => {
                          setAgentRecreating(true)
                          setError(null)
                          try {
                            const failedStepsPayload = failedSteps.map((s) => ({
                              id: s.id,
                              label: s.label,
                              log: s.log,
                            }))
                            const run = await client.scaffold.repair({
                              projectCode,
                              taskId,
                              stack,
                              failedSteps: failedStepsPayload,
                            })
                            setCoworkerRunId(run.id)
                          } catch (err) {
                            setError(`No se pudo encolar el agente: ${(err as Error).message}`)
                          } finally {
                            setAgentRecreating(false)
                          }
                        }}
                      >
                        {agentRecreating ? '…' : '🤖 Recrear con agente'}
                      </Button>
                    )}
                  </div>
                  {coworkerRunId && (
                    <div className="mt-4">
                      <CoworkerLiveView
                        client={client}
                        runId={coworkerRunId}
                        onFinished={(succeeded) => {
                          if (succeeded) {
                            setCoworkerRunId(null)
                            setError(null)
                            setSteps([])
                            setCreatedFiles([])
                            setFailedAttempts(0)
                            setDone(true)
                            onDone?.()
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              )
            }

            return (
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
            )
          })()}
        </div>
      )}

      {historyLoaded && history.length > 1 && <HistoryAccordion history={history.slice(0, -1)} />}
    </Card>
  )
}

function HistoryAccordion({ history }: { history: ScaffoldHistoryRun[] }) {
  const [open, setOpen] = useState(false)
  const reversed = [...history].reverse()
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left text-[12px] text-text-muted hover:text-text"
      >
        <span>Historial de ejecuciones previas ({history.length})</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {reversed.map((run) => (
            <HistoryRunRow key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryRunRow({ run }: { run: ScaffoldHistoryRun }) {
  const [open, setOpen] = useState(false)
  const date = new Date(run.startedAt).toLocaleString()
  const failed = run.steps.filter((s) => s.status === 'failed').length
  const passed = run.steps.filter((s) => s.status === 'done').length
  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Badge tone={run.outcome === 'succeeded' ? 'turtle' : 'danger'} outline>
            {run.outcome === 'succeeded' ? '✓' : '✗'}
          </Badge>
          <span className="text-[12px] text-text">{date}</span>
          <span className="text-[11px] text-text-muted">
            ✓ {passed} · ✗ {failed} · stack {run.stack}
          </span>
        </div>
        <span className="text-text-muted text-[11px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {run.steps.map((s) => (
            <div key={s.id} className="rounded-md border border-border bg-bg/40 p-2">
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    s.status === 'done' ? 'turtle' : s.status === 'failed' ? 'danger' : 'neutral'
                  }
                  outline
                >
                  {s.status === 'done' ? '✓' : s.status === 'failed' ? '✗' : '○'}
                </Badge>
                <span className="text-[12px] text-text">{s.label}</span>
              </div>
              {s.log && (
                <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap text-text-soft max-h-[120px] overflow-y-auto m-0">
                  {s.log}
                </pre>
              )}
            </div>
          ))}
          {run.error && <div className="text-[11px] text-danger">{run.error}</div>}
        </div>
      )}
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
  const [open, setOpen] = useState(step.status === 'running')
  const [userToggled, setUserToggled] = useState(false)
  const hasLog = !!step.log

  useEffect(() => {
    if (userToggled) return
    setOpen(step.status === 'running')
  }, [step.status, userToggled])
  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true)
          setOpen((v) => !v)
        }}
        disabled={!hasLog}
        className="w-full flex items-center gap-2 text-left disabled:cursor-default"
      >
        <Badge tone={tone} outline>
          {icon}
        </Badge>
        <span className="text-[13px] text-text flex-1">{step.label}</span>
        {hasLog && <span className="text-text-muted text-[11px]">{open ? '▾' : '▸'}</span>}
      </button>
      {open && hasLog && (
        <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap text-text-soft max-h-[160px] overflow-y-auto m-0">
          {step.log}
        </pre>
      )}
    </div>
  )
}

export function CoworkerLiveView({
  client,
  runId,
  onFinished,
}: {
  client: ApiClient
  runId: string
  onFinished: (succeeded: boolean) => void
}) {
  const [run, setRun] = useState<AgentRunDTO | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    let stoppedAt = 0
    async function poll() {
      try {
        const r = await client.agentRuns.get(runId)
        if (!alive) return
        setRun(r)
        if (r.status === 'succeeded' || r.status === 'failed' || r.status === 'cancelled') {
          if (stoppedAt === 0) stoppedAt = Date.now()
          if (Date.now() - stoppedAt > 1500) {
            const succeeded = r.status === 'succeeded' && /(^|\n)OK\s*$/i.test(r.output ?? '')
            onFinished(succeeded)
            return
          }
        }
      } catch (err) {
        if (alive) setPollError((err as Error).message)
      }
      if (alive) setTimeout(poll, 2000)
    }
    void poll()
    return () => {
      alive = false
    }
  }, [client, runId, onFinished])

  const tone =
    run?.status === 'succeeded'
      ? 'turtle'
      : run?.status === 'failed' || run?.status === 'cancelled'
        ? 'danger'
        : 'brand'
  const label =
    run?.status === 'succeeded'
      ? '✓ Coworker terminó'
      : run?.status === 'failed'
        ? '✗ Coworker falló'
        : run?.status === 'cancelled'
          ? '✗ Coworker cancelado'
          : '… Coworker trabajando'

  async function cancel() {
    try {
      await client.agentRuns.cancel(runId)
    } catch (err) {
      setPollError((err as Error).message)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={tone} outline>
            {label}
          </Badge>
          <span className="text-[11px] font-mono text-text-muted">run {runId.slice(0, 8)}</span>
        </div>
        {run && (run.status === 'queued' || run.status === 'running') && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancelar
          </Button>
        )}
      </div>
      {pollError && <div className="mt-2 text-[12px] text-danger">{pollError}</div>}
      {run?.errorMessage && <div className="mt-2 text-[12px] text-danger">{run.errorMessage}</div>}
      {run?.output && (
        <pre className="mt-3 text-[11px] font-mono whitespace-pre-wrap text-text-soft max-h-[400px] overflow-y-auto m-0">
          {run.output}
        </pre>
      )}
    </div>
  )
}
