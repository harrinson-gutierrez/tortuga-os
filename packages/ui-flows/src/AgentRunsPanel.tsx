import type { ApiClient } from '@tortuga-os/api-client'
import { AGENT_KINDS, AGENT_PROVIDERS } from '@tortuga-os/contracts'
import type { AgentRunDTO, CreateAgentRunInput } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select, TextField } from '@tortuga-os/ui'
import { useEffect, useState } from 'react'
import { useAsyncData } from './useAsyncData'

const STATUS_TONE: Record<
  AgentRunDTO['status'],
  'neutral' | 'brand' | 'turtle' | 'warning' | 'danger'
> = {
  queued: 'neutral',
  running: 'brand',
  succeeded: 'turtle',
  failed: 'danger',
  cancelled: 'warning',
}

export interface AgentRunsPanelProps {
  client: ApiClient
  taskId: string
  refreshKey?: number
  onChanged?: () => void
}

export function AgentRunsPanel({ client, taskId, refreshKey = 0, onChanged }: AgentRunsPanelProps) {
  const [localKey, setLocalKey] = useState(0)
  const runs = useAsyncData(
    () => client.agentRuns.listForTask(taskId),
    [client, taskId, refreshKey, localKey],
  )

  // Poll while any run is active.
  useEffect(() => {
    const active = runs.data?.some((r) => r.status === 'queued' || r.status === 'running') ?? false
    if (!active) return
    const t = setInterval(() => setLocalKey((k) => k + 1), 2000)
    return () => clearInterval(t)
  }, [runs.data])

  const [showForm, setShowForm] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  const selectedRun = useAsyncData(
    () => (selectedRunId ? client.agentRuns.get(selectedRunId) : Promise.resolve(null)),
    [client, selectedRunId, localKey],
  )

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Agent runs</h3>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Run agent'}
        </Button>
      </div>

      {showForm && (
        <div className="mt-4 border-t border-border pt-4">
          <RunAgentForm
            client={client}
            taskId={taskId}
            onLaunched={(r) => {
              setShowForm(false)
              setSelectedRunId(r.id)
              setLocalKey((k) => k + 1)
              onChanged?.()
            }}
          />
        </div>
      )}

      <div className="mt-5 grid grid-cols-[260px_1fr] gap-4">
        <div className="border-r border-border pr-4">
          {runs.loading && !runs.data && (
            <div className="text-[12px] text-text-muted">Cargando…</div>
          )}
          {runs.data && runs.data.length === 0 && (
            <div className="text-[12px] text-text-muted">Sin runs todavía.</div>
          )}
          {runs.data?.map((r) => {
            const isSel = r.id === selectedRunId
            return (
              <button
                type="button"
                key={r.id}
                onClick={() => setSelectedRunId(isSel ? null : r.id)}
                className={`w-full text-left py-2 px-2 rounded-md transition-colors ${isSel ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-text">{r.agentKind}</span>
                  <Badge tone={STATUS_TONE[r.status]} outline={r.status !== 'running'}>
                    {r.status}
                  </Badge>
                </div>
                <div className="mt-1 text-[10px] text-text-dim font-mono truncate">
                  {r.provider} · {r.model}
                </div>
                <div className="mt-0.5 text-[10px] text-text-muted font-mono">
                  {new Date(r.createdAt).toLocaleString()}
                </div>
                {(r.tokensIn > 0 || r.tokensOut > 0) && (
                  <div className="mt-0.5 text-[10px] text-text-muted font-mono">
                    {r.tokensIn}/{r.tokensOut} tok · {(r.costCents / 100).toFixed(2)} USD
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div>
          {!selectedRunId && (
            <div className="text-[12px] text-text-muted">
              Selecciona un run a la izquierda para ver su transcript.
            </div>
          )}
          {selectedRun.data && (
            <RunDetail
              client={client}
              run={selectedRun.data}
              onCancel={() => setLocalKey((k) => k + 1)}
            />
          )}
        </div>
      </div>
    </Card>
  )
}

function RunAgentForm({
  client,
  taskId,
  onLaunched,
}: {
  client: ApiClient
  taskId: string
  onLaunched: (run: AgentRunDTO) => void
}) {
  const [agentKind, setAgentKind] = useState<CreateAgentRunInput['agentKind']>('dev')
  const [provider, setProvider] = useState<CreateAgentRunInput['provider']>('claude-cli')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const r = await client.agentRuns.create({
        taskId,
        agentKind,
        provider,
        extraPrompt: extraPrompt.trim() || undefined,
      })
      onLaunched(r)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Eyebrow>Lanzar agente</Eyebrow>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Select
          label="Agente"
          value={agentKind}
          onChange={(e) => setAgentKind(e.target.value as CreateAgentRunInput['agentKind'])}
          options={AGENT_KINDS.map((k) => ({ value: k, label: k }))}
        />
        <Select
          label="Provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as CreateAgentRunInput['provider'])}
          options={AGENT_PROVIDERS.map((p) => ({ value: p, label: p }))}
        />
      </div>
      <div className="mt-2">
        <TextField
          label="Instrucciones extra (opcional)"
          placeholder="Foco para esta corrida"
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
        />
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={busy} variant="turtle">
          {busy ? 'Encolando…' : '▶ Lanzar'}
        </Button>
      </div>
    </div>
  )
}

function RunDetail({
  client,
  run,
  onCancel,
}: {
  client: ApiClient
  run: AgentRunDTO
  onCancel: () => void
}) {
  const canCancel = run.status === 'queued' || run.status === 'running'

  async function cancel() {
    try {
      await client.agentRuns.cancel(run.id)
      onCancel()
    } catch {
      /* silent */
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
            {run.agentKind} · {run.provider} · {run.model}
          </div>
          <div className="mt-1 text-[12px] text-text-muted font-mono">id: {run.id.slice(-12)}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
          {canCancel && (
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {run.errorMessage && (
        <div className="mb-3 text-[12px] text-danger border border-danger/30 rounded-md px-3 py-2">
          {run.errorMessage}
        </div>
      )}

      <Eyebrow>Transcript</Eyebrow>
      <pre className="mt-2 text-[12px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-3 py-2 max-h-[420px] overflow-y-auto">
        {run.output || '(empty — waiting for output)'}
      </pre>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-text-muted font-mono">
        <div>tokens in: {run.tokensIn}</div>
        <div>tokens out: {run.tokensOut}</div>
        <div>cost: ${(run.costCents / 100).toFixed(4)}</div>
      </div>
    </div>
  )
}
