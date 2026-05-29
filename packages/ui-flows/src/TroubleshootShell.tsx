import type { ApiClient } from '@tortuga-os/api-client'
import type { AgentRunDTO, TroubleshootReportDTO, TroubleshootStatus } from '@tortuga-os/contracts'
import { Badge, Button, Card } from '@tortuga-os/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAsyncData } from './useAsyncData'

const STATUS_TONE: Record<
  TroubleshootStatus,
  'neutral' | 'brand' | 'turtle' | 'warning' | 'danger'
> = {
  open: 'neutral',
  diagnosing: 'brand',
  proposed: 'brand',
  applying: 'brand',
  testing: 'brand',
  'awaiting-operator': 'warning',
  verified: 'turtle',
  resolved: 'turtle',
  dismissed: 'neutral',
  escalated: 'danger',
}

const STATUS_LABEL: Record<TroubleshootStatus, string> = {
  open: 'Abierto',
  diagnosing: 'Diagnosticando…',
  proposed: 'Fix propuesto',
  applying: 'Aplicando…',
  testing: 'Corriendo test…',
  'awaiting-operator': 'Necesita tu acción',
  verified: 'Test verde — valida en app',
  resolved: 'Resuelto',
  dismissed: 'Descartado',
  escalated: 'Escalado — revisa manual',
}

const IN_FLIGHT_STATUSES: ReadonlyArray<TroubleshootStatus> = [
  'open',
  'diagnosing',
  'applying',
  'testing',
]

const OPEN_STATUSES: ReadonlyArray<TroubleshootStatus> = [
  'open',
  'diagnosing',
  'proposed',
  'applying',
  'testing',
  'awaiting-operator',
  'verified',
  'escalated',
]

// TroubleshootStepBody — inline content for the wizard step

export interface TroubleshootStepBodyProps {
  client: ApiClient
  taskId: string
  refreshKey?: number
}

export function TroubleshootStepBody({
  client,
  taskId,
  refreshKey = 0,
}: TroubleshootStepBodyProps) {
  const [localKey, setLocalKey] = useState(0)
  const reports = useAsyncData(
    () => client.troubleshoot.listForTask(taskId),
    [client, taskId, refreshKey, localKey],
  )

  // Poll while any report is in-flight.
  useEffect(() => {
    const hasActive = reports.data?.some((r) => IN_FLIGHT_STATUSES.includes(r.status)) ?? false
    if (!hasActive) return
    const t = setInterval(() => setLocalKey((k) => k + 1), 2500)
    return () => clearInterval(t)
  }, [reports.data])

  const bump = useCallback(() => setLocalKey((k) => k + 1), [])

  const openReports = reports.data?.filter((r) => OPEN_STATUSES.includes(r.status)) ?? []
  const resolvedReports =
    reports.data?.filter((r) => ['resolved', 'dismissed'].includes(r.status)) ?? []

  return (
    <div className="space-y-4">
      <ReportComposer client={client} taskId={taskId} onCreated={bump} />

      {reports.loading && !reports.data && (
        <div className="text-[12px] text-text-muted">Cargando reports…</div>
      )}

      {openReports.length === 0 && resolvedReports.length === 0 && reports.data && (
        <div className="text-[12.5px] text-text-muted">
          Sin errores reportados aún. Si al probar la app encuentras algo, pégalo arriba y el agente
          lo diagnostica sin interrumpir tu flujo.
        </div>
      )}

      {openReports.map((r, idx) => (
        <ReportCard
          key={r.id}
          client={client}
          report={r}
          defaultOpen={idx === 0}
          onChanged={bump}
        />
      ))}

      {resolvedReports.length > 0 && (
        <details className="text-[12.5px] text-text-muted">
          <summary className="cursor-pointer select-none hover:text-text">
            Reports cerrados ({resolvedReports.length})
          </summary>
          <div className="mt-2 space-y-2">
            {resolvedReports.map((r) => (
              <ReportCard
                key={r.id}
                client={client}
                report={r}
                defaultOpen={false}
                onChanged={bump}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ReportComposer — inline form (textarea + screenshot)

interface ReportComposerProps {
  client: ApiClient
  taskId: string
  onCreated: () => void
}

function ReportComposer({ client, taskId, onCreated }: ReportComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [contextNote, setContextNote] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const reset = () => {
    setErrorText('')
    setContextNote('')
    setScreenshot(null)
    setSubmitError(null)
    setExpanded(false)
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setScreenshot(reader.result)
    }
    reader.readAsDataURL(file)
  }, [])

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') setScreenshot(reader.result)
        }
        reader.readAsDataURL(file)
        e.preventDefault()
        return
      }
    }
  }, [])

  const submit = async () => {
    if (!errorText.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.troubleshoot.create({
        taskId,
        errorText: errorText.trim(),
        ...(contextNote.trim() ? { contextNote: contextNote.trim() } : {}),
        ...(screenshot ? { beforeScreenshotPngBase64: screenshot } : {}),
      })
      reset()
      onCreated()
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true)
          setTimeout(() => textareaRef.current?.focus(), 0)
        }}
        className="w-full text-left rounded-md border border-dashed border-border hover:border-danger/50 hover:bg-danger/5 px-4 py-3 text-[13px] text-text-soft transition-colors"
      >
        <span className="text-danger font-medium">+ Reportar un error</span>
        <span className="text-text-muted"> que viste al probar la app</span>
      </button>
    )
  }

  return (
    <Card recessed>
      <div className="space-y-3">
        <div>
          <label
            htmlFor="troubleshoot-error"
            className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
          >
            Error (pega el texto exacto)
          </label>
          <textarea
            id="troubleshoot-error"
            ref={textareaRef}
            value={errorText}
            onChange={(e) => setErrorText(e.target.value)}
            onPaste={onPaste}
            rows={5}
            placeholder="PostgrestException(message: ..., code: 42501, ...)"
            className="w-full rounded-md bg-bg border border-border focus:border-brand/60 px-3 py-2 text-[12.5px] font-mono outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="troubleshoot-context"
            className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
          >
            ¿Qué estabas haciendo? (opcional)
          </label>
          <input
            id="troubleshoot-context"
            type="text"
            value={contextNote}
            onChange={(e) => setContextNote(e.target.value)}
            placeholder="Llené el form 'Crear hogar' y di Crear"
            className="w-full rounded-md bg-bg border border-border focus:border-brand/60 px-3 py-2 text-[13px] outline-none"
          />
        </div>

        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: heading-style label for the ScreenshotDropZone composite below */}
          <label className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5">
            Screenshot (opcional · pega o suelta una imagen)
          </label>
          <ScreenshotDropZone
            screenshot={screenshot}
            onFiles={handleFiles}
            onClear={() => setScreenshot(null)}
          />
        </div>

        {submitError && <div className="text-[12.5px] text-danger font-mono">{submitError}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={reset} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={submitting || !errorText.trim()}
          >
            {submitting ? 'Enviando…' : 'Diagnosticar'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

interface ScreenshotDropZoneProps {
  screenshot: string | null
  onFiles: (files: FileList | null) => void
  onClear: () => void
}

function ScreenshotDropZone({ screenshot, onFiles, onClear }: ScreenshotDropZoneProps) {
  const [dragOver, setDragOver] = useState(false)
  if (screenshot) {
    return (
      <div className="relative inline-block">
        <img
          src={screenshot}
          alt="screenshot"
          className="max-h-32 rounded-md border border-border"
        />
        <button
          type="button"
          onClick={onClear}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-danger text-white text-[11px] leading-none"
          aria-label="Quitar screenshot"
        >
          ×
        </button>
      </div>
    )
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        onFiles(e.dataTransfer.files)
      }}
      className={`block rounded-md border border-dashed px-3 py-4 text-center text-[12px] cursor-pointer transition-colors ${
        dragOver
          ? 'border-brand/60 bg-brand/5 text-text'
          : 'border-border text-text-muted hover:border-border-strong'
      }`}
    >
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onFiles(e.target.files)}
      />
      Suelta una imagen, click para elegir, o Ctrl+V en el campo de error
    </label>
  )
}

// ReportCard — collapsible per-report card with live agent transcript

interface ReportCardProps {
  client: ApiClient
  report: TroubleshootReportDTO
  defaultOpen: boolean
  onChanged: () => void
}

function ReportCard({ client, report, defaultOpen, onChanged }: ReportCardProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [applyInFlight, setApplyInFlight] = useState(false)
  const [applyResult, setApplyResult] = useState<{
    status: string
    filesWritten: string[]
    sqlResults?: Array<{ name: string; ok: boolean; detail: string }>
    testResult?: {
      passed: boolean
      exitCode: number | null
      testRelPath: string
      outputTail: string
      nextStatus: 'verified' | 'open' | 'escalated'
    }
    reason?: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onApply = async () => {
    setApplyInFlight(true)
    setError(null)
    try {
      const res = await client.troubleshoot.apply(report.id)
      setApplyResult(res.outcome)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setApplyInFlight(false)
    }
  }

  const onMarkAction = async (idx: number) => {
    try {
      await client.troubleshoot.markActionDone(report.id, { actionIndex: idx })
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const onConfirm = async () => {
    try {
      await client.troubleshoot.confirm(report.id, {})
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const onDismiss = async () => {
    try {
      await client.troubleshoot.dismiss(report.id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const onRediagnose = async () => {
    try {
      await client.troubleshoot.rediagnose(report.id)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const inFlight = IN_FLIGHT_STATUSES.includes(report.status)
  const isClosed = ['resolved', 'dismissed'].includes(report.status)

  return (
    <Card recessed={isClosed} active={inFlight}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-text-muted text-[12px]">{open ? '▾' : '▸'}</span>
          <Badge tone={STATUS_TONE[report.status]}>{STATUS_LABEL[report.status]}</Badge>
          <span className="text-[12.5px] text-text-soft truncate">
            {firstLine(report.errorText)}
          </span>
        </div>
        <span className="text-[11px] text-text-muted font-mono shrink-0">
          intento #{report.attemptCount} · {new Date(report.createdAt).toLocaleTimeString()}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1">
              Error reportado
            </div>
            <pre className="text-[12px] font-mono whitespace-pre-wrap text-text-soft bg-bg border border-border rounded-md p-2.5">
              {report.errorText}
            </pre>
            {report.contextNote && (
              <div className="mt-2 text-[12px] text-text-soft italic">
                Contexto: {report.contextNote}
              </div>
            )}
          </div>

          {inFlight && report.lastDiagnosisRunId && (
            <LiveAgentTranscript
              client={client}
              runId={report.lastDiagnosisRunId}
              reportStatus={report.status}
            />
          )}

          {report.diagnosis && (
            <DiagnosisDetail
              diagnosis={report.diagnosis}
              status={report.status}
              actions={report.requiredActions}
              onMarkAction={onMarkAction}
            />
          )}

          {applyResult && (
            <div className="rounded-md border border-border bg-bg p-3 text-[12.5px]">
              <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1">
                Resultado del apply
              </div>
              <div>
                Status: <span className="font-mono text-text">{applyResult.status}</span>
              </div>
              {applyResult.filesWritten.length > 0 && (
                <div className="mt-2">
                  <div className="text-text-muted">
                    Archivos escritos ({applyResult.filesWritten.length})
                  </div>
                  <ul className="ml-4 list-disc text-[12px] font-mono">
                    {applyResult.filesWritten.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {applyResult.sqlResults && applyResult.sqlResults.length > 0 && (
                <div className="mt-2">
                  <div className="text-text-muted">
                    Migrations SQL ({applyResult.sqlResults.length})
                  </div>
                  <ul className="ml-1 mt-1 space-y-1">
                    {applyResult.sqlResults.map((s) => (
                      <li key={s.name} className="flex items-start gap-2 text-[12px]">
                        <span className={s.ok ? 'text-turtle' : 'text-danger'}>
                          {s.ok ? '✓' : '✗'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-text">{s.name}</div>
                          {s.detail && (
                            <div
                              className={
                                s.ok
                                  ? 'text-[11px] text-text-muted truncate'
                                  : 'text-[11px] text-danger break-words'
                              }
                            >
                              {s.detail}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {applyResult.testResult && (
                <div className="mt-2">
                  <div className="text-text-muted">Test de integración</div>
                  <div className="ml-1 mt-1 flex items-start gap-2 text-[12px]">
                    <span className={applyResult.testResult.passed ? 'text-turtle' : 'text-danger'}>
                      {applyResult.testResult.passed ? '✓' : '✗'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-text break-all">
                        {applyResult.testResult.testRelPath}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        exit code: {applyResult.testResult.exitCode ?? 'killed'} · próximo estado:{' '}
                        {applyResult.testResult.nextStatus}
                      </div>
                      {!applyResult.testResult.passed && applyResult.testResult.outputTail && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-danger hover:underline">
                            Ver output del test ({applyResult.testResult.outputTail.length} chars)
                          </summary>
                          <pre className="mt-1 text-[11px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md p-2 max-h-48 overflow-y-auto">
                            {applyResult.testResult.outputTail}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {applyResult.reason && <div className="mt-2 text-warning">{applyResult.reason}</div>}
            </div>
          )}

          {error && <div className="text-[12px] text-danger font-mono">{error}</div>}

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            {report.status === 'proposed' && (
              <Button variant="primary" size="sm" onClick={onApply} disabled={applyInFlight}>
                {applyInFlight ? 'Aplicando…' : 'Aplicar fix'}
              </Button>
            )}
            {report.status === 'verified' && (
              <Button variant="turtle" size="sm" onClick={onConfirm}>
                Validado en app
              </Button>
            )}
            {report.status === 'escalated' && (
              <Button variant="secondary" size="sm" onClick={onRediagnose}>
                Re-diagnosticar
              </Button>
            )}
            {!isClosed && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Descartar
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

function firstLine(text: string): string {
  const head = text.split('\n')[0] ?? text
  return head.length > 90 ? `${head.slice(0, 87)}…` : head
}

// LiveAgentTranscript — streams the troubleshooter agent_run output

interface LiveAgentTranscriptProps {
  client: ApiClient
  runId: string
  reportStatus: TroubleshootStatus
}

function LiveAgentTranscript({ client, runId, reportStatus }: LiveAgentTranscriptProps) {
  const [localKey, setLocalKey] = useState(0)
  const run = useAsyncData(
    () => client.agentRuns.get(runId),
    [client, runId, reportStatus, localKey],
  )

  // Poll while the run is queued/running.
  useEffect(() => {
    const active = run.data?.status === 'queued' || run.data?.status === 'running'
    if (!active) return
    const t = setInterval(() => setLocalKey((k) => k + 1), 2000)
    return () => clearInterval(t)
  }, [run.data?.status])

  if (run.loading && !run.data) {
    return <div className="text-[12px] text-text-muted font-mono">Cargando transcript…</div>
  }
  if (!run.data) return null
  return <TranscriptView run={run.data} />
}

interface ToolCallSummary {
  tool: string
  ok: number
  fail: number
}

function summarizeOutput(output: string): {
  prose: string
  toolSummary: ToolCallSummary[]
  lastTools: Array<{ tool: string; target: string; ok: boolean }>
  failedReasons: string[]
} {
  const lines = output.split('\n')
  const counts = new Map<string, ToolCallSummary>()
  const lastTools: Array<{ tool: string; target: string; ok: boolean }> = []
  const failedReasons: string[] = []
  const proseLines: string[] = []
  const toolRe = /^\[tool:([A-Za-z]+)\s+(OK|FAILED)\]\s*([^—\n]*)(?:—\s*(.+))?$/

  for (const line of lines) {
    const m = toolRe.exec(line.trim())
    if (!m) {
      if (line.trim() && !line.startsWith('[stderr]')) {
        proseLines.push(line)
      }
      continue
    }
    const [, tool, status, targetRaw, reason] = m
    const ok = status === 'OK'
    const target = (targetRaw ?? '').trim()
    const entry = counts.get(tool!) ?? { tool: tool!, ok: 0, fail: 0 }
    if (ok) entry.ok++
    else entry.fail++
    counts.set(tool!, entry)
    lastTools.push({ tool: tool!, target, ok })
    if (!ok && reason) failedReasons.push(`${tool}: ${reason.trim()}`)
  }
  return {
    prose: proseLines.join('\n').trim(),
    toolSummary: Array.from(counts.values()),
    lastTools: lastTools.slice(-12),
    failedReasons: failedReasons.slice(-5),
  }
}

function TranscriptView({ run }: { run: AgentRunDTO }) {
  const summary = summarizeOutput(run.output ?? '')
  const active = run.status === 'queued' || run.status === 'running'
  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted">
          Lo que está haciendo el agente
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
          {active && (
            <span className="inline-flex items-center gap-1.5 text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
              en vivo
            </span>
          )}
          <span>
            {run.tokensIn}/{run.tokensOut} tok
          </span>
          {run.costCents > 0 && <span>${(run.costCents / 100).toFixed(2)}</span>}
        </div>
      </div>

      {summary.toolSummary.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {summary.toolSummary.map((s) => (
            <Badge key={s.tool} tone={s.fail > 0 ? 'warning' : 'neutral'} outline>
              {s.tool} {s.ok}
              {s.fail > 0 && ` · ${s.fail} fail`}
            </Badge>
          ))}
        </div>
      )}

      {summary.lastTools.length > 0 && (
        <ul className="text-[11.5px] font-mono space-y-0.5 mb-2 max-h-40 overflow-y-auto">
          {summary.lastTools.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: derived sliding window of tool calls with no stable id
            <li key={i} className={t.ok ? 'text-text-soft' : 'text-danger'} title={t.target}>
              <span className="text-text-muted">[{t.tool}]</span>{' '}
              {t.target && t.target.length > 70 ? `…${t.target.slice(-70)}` : t.target}
              {!t.ok && ' — fallo'}
            </li>
          ))}
        </ul>
      )}

      {summary.prose && (
        <details className="text-[11.5px]">
          <summary className="cursor-pointer text-text-muted hover:text-text">
            Texto del agente ({summary.prose.length} chars)
          </summary>
          <pre className="mt-1 whitespace-pre-wrap text-text-soft max-h-48 overflow-y-auto">
            {summary.prose.slice(-2000)}
          </pre>
        </details>
      )}

      {run.errorMessage && (
        <div className="mt-2 text-[12px] text-danger border border-danger/30 rounded-md px-2 py-1.5">
          {run.errorMessage}
        </div>
      )}
    </div>
  )
}

// DiagnosisDetail — same content as before but inline

import type { RequiredOperatorAction } from '@tortuga-os/contracts'

interface DiagnosisDetailProps {
  diagnosis: NonNullable<TroubleshootReportDTO['diagnosis']>
  status: TroubleshootStatus
  actions: RequiredOperatorAction[]
  onMarkAction: (idx: number) => void
}

function DiagnosisDetail({ diagnosis, status, actions, onMarkAction }: DiagnosisDetailProps) {
  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted">
          Diagnóstico
        </div>
        <Badge
          tone={
            diagnosis.confidence === 'high'
              ? 'turtle'
              : diagnosis.confidence === 'medium'
                ? 'warning'
                : 'danger'
          }
        >
          confianza: {diagnosis.confidence}
        </Badge>
      </div>
      <p className="text-[13px] text-text mb-3">{diagnosis.rootCause}</p>

      {diagnosis.proposedFiles.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1">
            Archivos propuestos ({diagnosis.proposedFiles.length})
          </div>
          <ul className="ml-4 list-disc text-[12px] font-mono text-text-soft space-y-0.5">
            {diagnosis.proposedFiles.map((f) => (
              <li key={f.path}>
                <span className="text-text">{f.path}</span> — {f.rationale}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diagnosis.proposedSql.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1">
            Migrations SQL ({diagnosis.proposedSql.length})
          </div>
          <ul className="ml-4 list-disc text-[12px] font-mono text-text-soft space-y-0.5">
            {diagnosis.proposedSql.map((s) => (
              <li key={s.name}>
                <span className="text-text">{s.name}</span> — {s.rationale}
              </li>
            ))}
          </ul>
          <div className="mt-1 text-[11px] text-text-muted">
            Se aplicarán via MCP Supabase al hacer click en "Aplicar fix".
          </div>
        </div>
      )}

      {actions.length > 0 && status === 'awaiting-operator' && (
        <div className="mb-3">
          <div className="text-[11px] font-mono uppercase tracking-eyebrow text-warning mb-2">
            Acciones requeridas de tu parte ({actions.filter((a) => !a.completedAt).length}{' '}
            pendientes)
          </div>
          <ul className="space-y-2">
            {actions.map((a, idx) => (
              <li
                key={`${a.title}-${idx}`}
                className="rounded-md border border-border bg-bg-alt p-2.5"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={a.completedAt != null}
                    onChange={() => {
                      if (a.completedAt == null) onMarkAction(idx)
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-text">{a.title}</div>
                    <div className="text-[12px] text-text-soft mt-0.5">{a.why}</div>
                    <div className="text-[12px] font-mono text-text-muted mt-1">📍 {a.where}</div>
                    {a.deepLink && (
                      <a
                        href={a.deepLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12px] text-brand hover:underline"
                      >
                        Abrir ↗
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {diagnosis.manualValidationSteps.length > 0 && status === 'verified' && (
        <div className="mt-3">
          <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1">
            Pasos para validar en app
          </div>
          <ol className="ml-4 list-decimal text-[12.5px] text-text-soft space-y-0.5">
            {diagnosis.manualValidationSteps.map((s, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: plain string list of validation steps with no stable id
              <li key={idx}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// AppFailedDiagnose — Step-4 escape hatch when the app won't open

const CRASH_MARKERS = [
  'Unhandled Exception',
  'E/flutter',
  'FAILURE:',
  'Exception:',
  'Error:',
  'FileNotFoundError',
  'MissingPluginException',
  'compilation failed',
  'Gradle task assembleDebug failed',
]

function tailHasCrash(lines: string[]): boolean {
  return lines.some((l) => CRASH_MARKERS.some((m) => l.includes(m)))
}

/** Last N lines, kept short enough to read but long enough to carry the
 *  stack trace the troubleshooter needs. */
function tailLines(lines: string[], n = 60): string {
  return lines.slice(-n).join('\n').trim()
}

export interface AppFailedDiagnoseProps {
  client: ApiClient
  taskId: string
  onCreated: () => void
  onCancel: () => void
}

/**
 * Inline panel shown when the operator says "the app didn't open" in the
 * manual-test step. It auto-pulls the tail of the emulator's `flutter run`
 * log (so a non-technical operator never has to copy a stack trace), and
 * lets them add their own note + a screenshot. All three are merged into a
 * single troubleshoot report. If no device log is available, the operator
 * can still describe the failure by hand — we never dead-end them.
 */
export function AppFailedDiagnose({ client, taskId, onCreated, onCancel }: AppFailedDiagnoseProps) {
  const devices = useAsyncData(() => client.preview.listDevices(), [client])
  const serial = devices.data?.devices[0]?.serial ?? null

  const [logTail, setLogTail] = useState('')
  const [logState, setLogState] = useState<'idle' | 'loading' | 'found' | 'empty' | 'no-device'>(
    'loading',
  )
  const [note, setNote] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: pull once per resolved serial
  useEffect(() => {
    let cancelled = false
    async function pull() {
      if (devices.loading) return
      if (!serial) {
        setLogState('no-device')
        return
      }
      setLogState('loading')
      try {
        const log = await client.preview.appLog(serial)
        if (cancelled) return
        const tail = tailLines(log.lines)
        setLogTail(tail)
        setLogState(tail ? 'found' : 'empty')
      } catch {
        if (!cancelled) setLogState('empty')
      }
    }
    void pull()
    return () => {
      cancelled = true
    }
  }, [serial, devices.loading])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setScreenshot(reader.result)
    }
    reader.readAsDataURL(file)
  }, [])

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') setScreenshot(reader.result)
        }
        reader.readAsDataURL(file)
        e.preventDefault()
        return
      }
    }
  }, [])

  // The error text we send merges the auto-captured log with the operator's
  // own words. Either alone is enough to submit.
  const composedError = (() => {
    const parts: string[] = []
    if (logTail.trim()) parts.push(`--- Log del emulador (flutter run) ---\n${logTail.trim()}`)
    if (note.trim()) parts.push(`--- Lo que vi / hice ---\n${note.trim()}`)
    return parts.join('\n\n')
  })()
  const canSubmit = composedError.trim().length > 0 && !submitting

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await client.troubleshoot.create({
        taskId,
        errorText: composedError.trim(),
        contextNote: 'Reportado desde "La app no abre" (paso de prueba manual)',
        ...(screenshot ? { beforeScreenshotPngBase64: screenshot } : {}),
      })
      onCreated()
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card recessed>
      <div className="space-y-3">
        <div className="text-[13px] text-text">
          Vamos a diagnosticar por qué no abre. El agente lee el error solo — tú solo confirma o
          agrega lo que viste.
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted">
              Error del emulador (capturado automáticamente)
            </span>
            {logState === 'found' && (
              <Badge tone={tailHasCrash(logTail.split('\n')) ? 'danger' : 'warning'} outline>
                {tailHasCrash(logTail.split('\n')) ? 'crash detectado' : 'últimas líneas'}
              </Badge>
            )}
          </div>
          {logState === 'loading' && (
            <div className="text-[12px] text-text-muted">Leyendo el log del emulador…</div>
          )}
          {logState === 'no-device' && (
            <div className="text-[12px] text-warning">
              No hay dispositivo conectado. Enciende el emulador y dale ▶ Instalar y correr, o
              describe abajo qué pasó.
            </div>
          )}
          {logState === 'empty' && (
            <div className="text-[12px] text-text-muted">
              No encontré log de esta corrida. Describe abajo qué pasó (y pega el error si lo
              tienes).
            </div>
          )}
          {logState === 'found' && (
            <textarea
              value={logTail}
              onChange={(e) => setLogTail(e.target.value)}
              rows={6}
              className="w-full rounded-md bg-bg border border-border focus:border-brand/60 px-3 py-2 text-[12px] font-mono outline-none"
            />
          )}
        </div>

        <div>
          <label
            htmlFor="app-failed-note"
            className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
          >
            ¿Qué viste? (opcional, pero ayuda)
          </label>
          <textarea
            id="app-failed-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onPaste={onPaste}
            rows={3}
            placeholder="Se quedó pegada en el splash y no avanzó. Toqué Reintentar y volvió a fallar."
            className="w-full rounded-md bg-bg border border-border focus:border-brand/60 px-3 py-2 text-[13px] outline-none"
          />
        </div>

        <div>
          {/* biome-ignore lint/a11y/noLabelWithoutControl: heading-style label for the ScreenshotDropZone composite below */}
          <label className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5">
            Screenshot (opcional · pega o suelta una imagen)
          </label>
          <ScreenshotDropZone
            screenshot={screenshot}
            onFiles={handleFiles}
            onClear={() => setScreenshot(null)}
          />
        </div>

        {submitError && <div className="text-[12.5px] text-danger font-mono">{submitError}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit}>
            {submitting ? 'Enviando…' : 'Diagnosticar'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// Helper hook still exported in case TaskDetail wants a badge count

export function useTaskTroubleshootCount(
  client: ApiClient,
  taskId: string | null,
  refreshKey: number,
): number {
  const [count, setCount] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch only on taskId or refreshKey change
  useEffect(() => {
    if (!taskId) {
      setCount(0)
      return
    }
    let cancelled = false
    void client.troubleshoot
      .listForTask(taskId)
      .then((reports) => {
        if (cancelled) return
        const open = reports.filter((r) => OPEN_STATUSES.includes(r.status))
        setCount(open.length)
      })
      .catch(() => {
        if (!cancelled) setCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [client, taskId, refreshKey])
  return count
}
