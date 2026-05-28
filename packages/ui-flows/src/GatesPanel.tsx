import type { ApiClient } from '@tortuga-os/api-client'
import type { GateDTO, GateExecutionDTO, GateType, RunGatesResultDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

const GATE_TYPE_OPTIONS: GateType[] = ['G1_ANALYZE', 'G3_BUILD']

const STACK_OPTIONS = ['node', 'flutter', 'nextjs', 'vite-react', 'angular', 'astro'] as const
type Stack = (typeof STACK_OPTIONS)[number]

const STATUS_TONE: Record<
  GateDTO['status'] | GateExecutionDTO['status'],
  'neutral' | 'turtle' | 'warning' | 'danger'
> = {
  pending: 'neutral',
  passed: 'turtle',
  failed: 'danger',
  skipped: 'warning',
}

export interface GatesPanelProps {
  client: ApiClient
  taskId: string
  iterationId: string | null
  refreshKey?: number
  onChanged?: () => void
}

export function GatesPanel({
  client,
  taskId,
  iterationId,
  refreshKey = 0,
  onChanged,
}: GatesPanelProps) {
  const [stack, setStack] = useState<Stack>('node')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRun, setLastRun] = useState<RunGatesResultDTO | null>(null)

  const gates = useAsyncData(
    () => (iterationId ? client.gates.listForIteration(iterationId) : Promise.resolve([])),
    [client, iterationId, refreshKey, lastRun],
  )

  async function run() {
    if (!iterationId) {
      setError('No hay iteración abierta')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await client.gates.runForTask(taskId, { stack, gates: GATE_TYPE_OPTIONS })
      setLastRun(result)
      onChanged?.()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Gates</h3>
        <div className="flex items-end gap-2">
          <Select
            label="Stack"
            value={stack}
            onChange={(e) => setStack(e.target.value as Stack)}
            options={STACK_OPTIONS.map((s) => ({ value: s, label: s }))}
          />
          <Button size="sm" onClick={run} disabled={busy || !iterationId} variant="turtle">
            {busy ? 'Corriendo…' : 'Run G1+G3'}
          </Button>
        </div>
      </div>

      {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

      <Eyebrow className="mt-4">Estado actual</Eyebrow>
      <div className="mt-2 space-y-2">
        {gates.loading && !gates.data && (
          <div className="text-[12px] text-text-muted">Cargando…</div>
        )}
        {gates.data && gates.data.length === 0 && (
          <div className="text-[12px] text-text-muted">Sin gates todavía.</div>
        )}
        {gates.data?.map((g) => (
          <div
            key={g.id}
            className="rounded-md border border-border bg-bg-alt px-3 py-2 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[12px] text-text">{g.gateType}</span>
              <Badge tone={STATUS_TONE[g.status]} outline>
                {g.status}
              </Badge>
            </div>
            <div className="text-[11px] text-text-muted font-mono">{g.outputPath ?? '—'}</div>
          </div>
        ))}
      </div>

      {lastRun && (
        <>
          <Eyebrow className="mt-4">Última corrida</Eyebrow>
          <div className="mt-2 space-y-2">
            {lastRun.executions.map((ex) => (
              <div
                key={ex.gateType}
                className="rounded-md border border-border bg-bg-alt px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-text">{ex.gateType}</span>
                  <Badge tone={STATUS_TONE[ex.status]} outline>
                    {ex.status}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-text-muted font-mono">
                  exit {ex.exitCode ?? '—'} · {(ex.durationMs / 1000).toFixed(1)}s
                  {ex.outputPath && (
                    <>
                      <span className="mx-2">·</span>
                      <span className="text-text-soft">{ex.outputPath}</span>
                    </>
                  )}
                </div>
                {ex.reason && (
                  <div className="mt-1 text-[11px] text-warning italic">{ex.reason}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
