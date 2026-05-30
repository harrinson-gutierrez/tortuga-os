import type { ApiClient } from '@tortuga-os/api-client'
import type {
  AgentRunDTO,
  GateType,
  RunGatesResultDTO,
  TaskConversationDTO,
  TaskCoworkerPhase,
  TaskMessageDTO,
} from '@tortuga-os/contracts'
import { TASK_COWORKER_PHASES } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow } from '@tortuga-os/ui'
import { useEffect, useRef, useState } from 'react'
import type { ProjectStack } from './TaskDetail'
import { useAsyncData } from './useAsyncData'

export interface CoworkerChatProps {
  client: ApiClient
  taskId: string
  stack: ProjectStack
  onModeSwitch: () => void
}

const PHASE_LABEL: Record<TaskCoworkerPhase, string> = {
  planning: 'Planeación',
  construction: 'Construcción',
  execution: 'Ejecución',
  validation: 'Validación',
  delivery: 'Entrega',
}

const PHASE_HINT: Record<TaskCoworkerPhase, string> = {
  planning: 'Acuerda con el agente qué se va a construir y cómo, antes de tocar código.',
  construction: 'Pídele al agente que implemente. Edita archivos turno a turno como en un pair.',
  execution: 'Corre y prueba lo construido. Itera sobre lo que no funcione.',
  validation: 'Corre los gates automáticos (tipos + build + tests). No se saltan.',
  delivery: 'Cierra la tarea: mándala a QA o apruébala bajo tu criterio.',
}

const GATE_LIST: GateType[] = ['G1_ANALYZE', 'G3_BUILD', 'G6_REAL_WORK', 'G5_FIDELITY']

function nextPhaseOf(phase: TaskCoworkerPhase): TaskCoworkerPhase | null {
  const i = TASK_COWORKER_PHASES.indexOf(phase)
  if (i < 0 || i >= TASK_COWORKER_PHASES.length - 1) return null
  return TASK_COWORKER_PHASES[i + 1] ?? null
}

/**
 * Coworker mode: a turn-based chat that drives the dev agent like Claude
 * Code. The operator talks to the agent, watches its run output stream in,
 * and walks the task through explicit phases. Gates and approval stay as
 * real calls to the existing endpoints — the coworker never bypasses them.
 */
export function CoworkerChat({ client, taskId, stack, onModeSwitch }: CoworkerChatProps) {
  const conv = useAsyncData(() => client.coworker.getOrStart(taskId), [client, taskId])

  const [localMessages, setLocalMessages] = useState<TaskMessageDTO[] | null>(null)
  const [localConv, setLocalConv] = useState<TaskConversationDTO | null>(null)

  useEffect(() => {
    if (conv.data) {
      setLocalMessages(conv.data.messages)
      setLocalConv(conv.data.conversation)
    }
  }, [conv.data])

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  // Live run output for the in-flight turn, accumulated from `delta` events.
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [advancing, setAdvancing] = useState(false)
  const [reattaching, setReattaching] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Reattach to a turn that's still running in the background (operator sent a
  // turn, navigated away, came back). An agent message with an empty body +
  // an agentRunId is an unfinished placeholder: poll its run until it lands,
  // then reload the conversation so its content fills in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: guarded by reattaching/sending flags
  useEffect(() => {
    if (!localConv || !localMessages || sending || reattaching) return
    const last = localMessages[localMessages.length - 1]
    if (!last || last.role !== 'agent' || last.agentRunId === null || last.content.trim() !== '')
      return
    setReattaching(true)
    const runId = last.agentRunId
    const convId = localConv.id
    let alive = true
    ;(async () => {
      try {
        for (let i = 0; i < 1200 && alive; i++) {
          const run = await client.agentRuns.get(runId)
          if (run.output) setStreamingText(run.output)
          if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
            const fresh = await client.coworker.load(convId)
            if (!alive) return
            setLocalMessages(fresh.messages)
            setLocalConv(fresh.conversation)
            setStreamingText('')
            break
          }
          await new Promise((r) => setTimeout(r, 1000))
        }
      } catch {
        /* run vanished or network blip — leave the placeholder as-is */
      } finally {
        if (alive) setReattaching(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [localConv, localMessages, sending, reattaching, client])

  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll only on tracked count changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [localMessages?.length, sending, streamingText.length])

  async function send() {
    if (!input.trim() || !localConv) return
    const content = input.trim()
    setSending(true)
    setStreamingText('')
    setError(null)
    setInput('')
    const optimistic: TaskMessageDTO = {
      id: `optimistic-${Date.now()}`,
      conversationId: localConv.id,
      role: 'user',
      content,
      agentRunId: null,
      phase: localConv.phase,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setLocalMessages((prev) => [...(prev ?? []), optimistic])
    try {
      await client.coworker.sendMessageStream(localConv.id, content, {
        onUserSaved: (m) => {
          setLocalMessages((prev) => {
            const without = (prev ?? []).filter((x) => x.id !== optimistic.id)
            return [...without, m]
          })
        },
        onDelta: (text) => {
          setStreamingText((prev) => prev + text)
        },
        onDone: () => {},
        onError: (msg) => {
          setError(msg)
        },
      })
      // The backend persists the turn (placeholder + worker post-hook), so the
      // conversation on disk is the source of truth — reload it whether or not
      // the SSE delivered `done` (the Hono/Node adapter sometimes buffers the
      // final chunk, and the turn may even finish after this connection drops).
      const fresh = await client.coworker.load(localConv.id)
      setLocalMessages(fresh.messages)
      setLocalConv(fresh.conversation)
      setStreamingText('')
    } catch (e) {
      setError((e as Error).message)
      setLocalMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id))
      setInput(content)
    } finally {
      setSending(false)
      setStreamingText('')
    }
  }

  async function advancePhase() {
    if (!localConv) return
    const next = nextPhaseOf(localConv.phase)
    if (!next) return
    setAdvancing(true)
    setError(null)
    try {
      const fresh = await client.coworker.setPhase(localConv.id, next)
      setLocalConv(fresh.conversation)
      setLocalMessages(fresh.messages)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAdvancing(false)
    }
  }

  if (conv.error)
    return (
      <Card>
        <div className="text-[13px] text-danger">{conv.error}</div>
      </Card>
    )
  if (!localConv || !localMessages) {
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando coworker…</div>
      </Card>
    )
  }

  const c = localConv
  const messages = localMessages
  const empty = messages.length === 0
  const next = nextPhaseOf(c.phase)

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Coworker</Eyebrow>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0 mt-1">
            Programa turno a turno con el agente
          </h3>
          <div className="mt-1 text-[12px] text-text-muted">{PHASE_HINT[c.phase]}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onModeSwitch}>
          Modo manual
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {TASK_COWORKER_PHASES.map((p, i) => {
          const active = p === c.phase
          const passed = i < TASK_COWORKER_PHASES.indexOf(c.phase)
          return (
            <Badge key={p} tone={active ? 'brand' : passed ? 'turtle' : 'neutral'} outline>
              {active ? '● ' : passed ? '✓ ' : ''}
              {PHASE_LABEL[p]}
            </Badge>
          )
        })}
      </div>

      <div
        ref={scrollRef}
        className="mt-4 max-h-[480px] overflow-y-auto space-y-3 pr-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {empty && (
          <div className="text-[12px] text-text-muted italic py-6 text-center">
            Dile al agente qué hacer. Por ejemplo:{' '}
            <em>"Implementa la pantalla de login según la story"</em>.
          </div>
        )}
        {messages.map((m, i) => {
          // The trailing empty agent placeholder is rendered as the live run
          // (below) instead of an empty bubble.
          const isLivePlaceholder =
            i === messages.length - 1 &&
            m.role === 'agent' &&
            m.agentRunId !== null &&
            m.content.trim() === ''
          if (isLivePlaceholder) return null
          return <CoworkerMessage key={m.id} message={m} client={client} />
        })}
        {(sending || reattaching) && <StreamingRun text={streamingText} />}
      </div>

      {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

      <div className="mt-4 border-t border-border pt-4">
        <div className="flex items-end gap-2">
          <textarea
            className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-[13px] text-text font-mono leading-snug min-h-[80px] focus:outline-none focus:border-brand"
            placeholder="Escribe una instrucción para el agente…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                void send()
              }
            }}
            disabled={sending}
          />
          <Button variant="turtle" onClick={send} disabled={sending || !input.trim()}>
            {sending ? '…' : '▶ Enviar'}
          </Button>
        </div>
        <div className="mt-1 text-[10px] text-text-muted">Ctrl+Enter para enviar.</div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {c.phase === 'validation' && (
          <ValidationActions client={client} taskId={taskId} stack={stack} disabled={sending} />
        )}
        {c.phase === 'delivery' && (
          <DeliveryActions client={client} taskId={taskId} disabled={sending} />
        )}
        {next && (
          <div className="mt-3 flex justify-end">
            <Button variant="primary" onClick={advancePhase} disabled={advancing || sending}>
              {advancing ? '…' : `Avanzar fase → ${PHASE_LABEL[next]}`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

function CoworkerMessage({ message, client }: { message: TaskMessageDTO; client: ApiClient }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-md px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap bg-brand/15 text-text border border-brand/30">
          {message.content}
        </div>
      </div>
    )
  }
  if (message.agentRunId) {
    return <AgentRunMessage runId={message.agentRunId} fallback={message.content} client={client} />
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-md px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap bg-bg-alt text-text border border-border">
        {message.content}
      </div>
    </div>
  )
}

/**
 * Render an agent turn from its real run: the run output carries the tool
 * markers (Read/Edit/Bash …) the dev agent emitted. We show it in a mono
 * transcript so the operator sees exactly what the agent did, falling back
 * to the persisted message content if the run can't be read.
 */
function AgentRunMessage({
  runId,
  fallback,
  client,
}: {
  runId: string
  fallback: string
  client: ApiClient
}) {
  const run = useAsyncData<AgentRunDTO | null>(() => client.agentRuns.get(runId), [client, runId])
  const output = run.data?.output ?? fallback
  const empty = output.trim().length === 0
  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted mb-2">
        <span>Agente</span>
        <span className="text-text-dim">run {runId.slice(0, 8)}</span>
        {run.data && run.data.costCents > 0 && (
          <span className="text-text-dim">
            · {run.data.tokensIn}/{run.data.tokensOut} tok · $
            {(run.data.costCents / 100).toFixed(2)}
          </span>
        )}
      </div>
      {empty ? (
        <div className="text-[12px] text-text-muted italic">Sin output.</div>
      ) : (
        <pre className="text-[12px] font-mono whitespace-pre-wrap text-text-soft max-h-[420px] overflow-y-auto m-0">
          {output}
        </pre>
      )}
    </div>
  )
}

/** Last meaningful line the agent emitted — a tool marker or prose — shown as
 * a one-line "currently doing" hint above the full transcript. */
function lastActivity(text: string): string | null {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!
    const tool = l.match(/^\[tool:(\w+)\s+(OK|FAILED)\]\s*(.*)$/)
    if (tool) {
      const [, name, status, target] = tool
      const verb = status === 'OK' ? '' : ' (falló)'
      return `${name}${verb}${target ? `: ${target.slice(0, 80)}` : ''}`
    }
    if (l.length > 3) return l.slice(0, 100)
  }
  return null
}

function StreamingRun({ text }: { text: string }) {
  const activity = text.trim().length === 0 ? null : lastActivity(text)
  return (
    <div className="rounded-md border border-brand/40 bg-bg-alt p-3">
      <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted mb-2">
        <span>Agente</span>
        <Badge tone="brand" outline>
          en vivo
        </Badge>
        <span className="text-brand animate-pulse">●</span>
        <span className="text-text-soft truncate">{activity ?? 'Arrancando agente…'}</span>
      </div>
      {text.trim().length > 0 && (
        <pre className="text-[12px] font-mono whitespace-pre-wrap text-text-soft max-h-[420px] overflow-y-auto m-0">
          {text}
          <span className="animate-pulse text-brand">▌</span>
        </pre>
      )}
    </div>
  )
}

function ValidationActions({
  client,
  taskId,
  stack,
  disabled,
}: {
  client: ApiClient
  taskId: string
  stack: ProjectStack
  disabled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RunGatesResultDTO | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const res = await client.gates.runForTask(taskId, { stack, gates: GATE_LIST })
      setResult(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Gates de validación</Eyebrow>
        <Button size="sm" variant="turtle" onClick={run} disabled={busy || disabled}>
          {busy ? 'Corriendo…' : '▶ Correr gates'}
        </Button>
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      {result && (
        <div className="mt-2 space-y-1">
          {result.executions.map((g) => (
            <div key={g.gateType} className="flex items-center gap-2 text-[12px]">
              <Badge
                tone={
                  g.status === 'passed' ? 'turtle' : g.status === 'failed' ? 'danger' : 'neutral'
                }
                outline
              >
                {g.status === 'passed' ? '✓' : g.status === 'failed' ? '✗' : '—'}
              </Badge>
              <span className="font-mono text-text-soft">{g.gateType}</span>
              {g.reason && <span className="text-text-muted">— {g.reason}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeliveryActions({
  client,
  taskId,
  disabled,
}: {
  client: ApiClient
  taskId: string
  disabled: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function ensureInQa() {
    try {
      await client.tasks.submitQa(taskId)
    } catch {
      /* may already be in 'qa'; ignore */
    }
  }

  async function submitQa() {
    setBusy(true)
    setError(null)
    try {
      await client.tasks.submitQa(taskId)
      setDone('Enviada a QA.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      await ensureInQa()
      await client.tasks.approve(taskId, { closedByRole: 'qa', notes: undefined })
      setDone('Tarea aprobada y cerrada.')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg/30 p-3">
      <Eyebrow>Entrega</Eyebrow>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={submitQa} disabled={busy || disabled}>
          Enviar a QA
        </Button>
        <Button size="sm" variant="turtle" onClick={approve} disabled={busy || disabled}>
          {busy ? '…' : '✓ Aprobar'}
        </Button>
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      {done && <div className="mt-2 text-[12px] text-turtle">{done}</div>}
    </div>
  )
}
