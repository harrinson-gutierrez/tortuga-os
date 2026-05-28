import type { ApiClient } from '@tortuga-os/api-client'
import type { DiscoveryMessageDTO, DiscoveryStoryDraftDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select } from '@tortuga-os/ui'
import { useEffect, useRef, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface DiscoveryChatProps {
  client: ApiClient
  projectCode: string
  onApproved?: (result: { storyIds: string[]; taskIds: string[] }) => void
}

type Provider = 'claude-cli' | 'anthropic-sdk'

const PROVIDER_LABEL: Record<Provider, string> = {
  'claude-cli': 'Claude (CLI local, suscripción Pro)',
  'anthropic-sdk': 'Claude (API, requiere API key)',
}

export function DiscoveryChat({ client, projectCode, onApproved }: DiscoveryChatProps) {
  const [provider, setProvider] = useState<Provider>('claude-cli')
  const conv = useAsyncData(
    () => client.discovery.getOrStart(projectCode, provider),
    [client, projectCode, provider],
  )

  // Local mirror of messages + conversation. We seed it from the initial
  // fetch and then append user/agent messages from each send() call,
  // never re-fetching the whole transcript on every message — that's what
  // was wiping the visible history.
  const [localMessages, setLocalMessages] = useState<DiscoveryMessageDTO[] | null>(null)
  const [localConv, setLocalConv] =
    useState<
      typeof conv.data extends null ? null : NonNullable<typeof conv.data>['conversation'] | null
    >(null)

  useEffect(() => {
    if (conv.data) {
      setLocalMessages(conv.data.messages)
      setLocalConv(conv.data.conversation)
    }
  }, [conv.data])

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  // Tokens accumulated as the agent streams its reply. Shown in a
  // synthetic "in-flight" bubble at the bottom of the message list.
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

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
    // Optimistic insert of the user's message so it shows up immediately.
    const optimistic: DiscoveryMessageDTO = {
      id: `optimistic-${Date.now()}`,
      conversationId: localConv.id,
      role: 'user',
      content,
      model: null,
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setLocalMessages((prev) => [...(prev ?? []), optimistic])
    let doneSeen = false
    try {
      await client.discovery.streamMessage(localConv.id, content, {
        onUserSaved: (m) => {
          // Replace optimistic with the real (persisted) user message.
          setLocalMessages((prev) => {
            const without = (prev ?? []).filter((x) => x.id !== optimistic.id)
            return [...without, m]
          })
        },
        onDelta: (text) => {
          setStreamingText((prev) => prev + text)
        },
        onDone: (agentMessage, storiesDraft) => {
          doneSeen = true
          setStreamingText('')
          setLocalMessages((prev) => [...(prev ?? []), agentMessage])
          if (storiesDraft) {
            setLocalConv((prev) => (prev ? { ...prev, status: 'converged', storiesDraft } : prev))
          }
        },
        onError: (msg) => {
          setError(msg)
        },
      })
      // Fallback: if the SSE stream closed without us seeing the `done`
      // event (Hono/Node SSE adapters sometimes buffer the last chunk),
      // re-fetch the conversation from disk and reconcile.
      if (!doneSeen) {
        const fresh = await client.discovery.load(localConv.id)
        setLocalMessages(fresh.messages)
        setLocalConv(fresh.conversation)
        setStreamingText('')
      }
    } catch (e) {
      setError((e as Error).message)
      // Roll back the optimistic insert and put the input text back.
      setLocalMessages((prev) => (prev ?? []).filter((m) => m.id !== optimistic.id))
      setInput(content)
    } finally {
      setSending(false)
      setStreamingText('')
    }
  }

  async function approve() {
    if (!localConv) return
    setApproving(true)
    setError(null)
    try {
      const result = await client.discovery.approve(localConv.id)
      setLocalConv((prev) => (prev ? { ...prev, status: 'archived' } : prev))
      onApproved?.(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApproving(false)
    }
  }

  if (conv.error)
    return (
      <Card>
        <div className="text-[13px] text-danger">{conv.error}</div>
      </Card>
    )
  // Only show the spinner before the first successful fetch. After that
  // we render from localMessages/localConv so reloads don't blank the chat.
  if (!localConv || !localMessages) {
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando…</div>
      </Card>
    )
  }

  const c = localConv
  const messages = localMessages
  const empty = messages.length === 0
  const showDraft = c.storiesDraft != null && c.storiesDraft.length > 0
  const approved = c.status === 'archived'
  const converged = c.status === 'converged'
  // The backend rejects new messages once the conversation is converged
  // (status='converged') or archived. We mirror that in the UI so the
  // operator doesn't get a confusing red error after submit.
  const inputDisabled = converged || approved

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <Eyebrow>Descubrimiento</Eyebrow>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0 mt-1">
            Conversa con el agente para definir qué construir
          </h3>
          <div className="mt-1 text-[12px] text-text-muted">
            El agente preguntará lo necesario y propondrá una lista de tareas que puedes aprobar.
          </div>
        </div>
        <Badge
          tone={c.status === 'active' ? 'brand' : c.status === 'converged' ? 'warning' : 'turtle'}
          outline
        >
          {c.status === 'active'
            ? 'en curso'
            : c.status === 'converged'
              ? 'cotización lista'
              : 'aprobada'}
        </Badge>
      </div>

      {empty && (
        <div className="mt-4">
          <Select
            label="¿Qué motor LLM usamos?"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            options={(['claude-cli', 'anthropic-sdk'] as Provider[]).map((p) => ({
              value: p,
              label: PROVIDER_LABEL[p],
            }))}
          />
          <div className="mt-1 text-[11px] text-text-muted">
            CLI usa tu suscripción Claude Pro. API requiere tu key en{' '}
            <code className="text-text-soft">apps/sidecar/.env</code>.
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="mt-4 max-h-[480px] overflow-y-auto space-y-3 pr-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {empty && (
          <div className="text-[12px] text-text-muted italic py-6 text-center">
            Cuéntale al agente qué quieres construir. Por ejemplo:{' '}
            <em>"Quiero una app móvil para gestionar mis gastos personales"</em>.
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {sending && <StreamingBubble text={streamingText} />}
      </div>

      {showDraft && c.storiesDraft && (
        <div className="mt-5 border-t border-border pt-4">
          <DraftReview
            stories={c.storiesDraft}
            approved={approved}
            approving={approving}
            onApprove={approve}
            onRequestChanges={
              converged
                ? () => {
                    // Flip the local conv status back to 'active' so the
                    // input reappears immediately. The backend will reopen
                    // server-side as soon as the next message hits
                    // appendUserMessage.
                    setLocalConv((prev) => (prev ? { ...prev, status: 'active' } : prev))
                  }
                : undefined
            }
          />
        </div>
      )}

      {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

      {!inputDisabled && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-end gap-2">
            <textarea
              className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-[13px] text-text font-mono leading-snug min-h-[80px] focus:outline-none focus:border-brand"
              placeholder="Escribe aquí tu mensaje…"
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
      )}

      {converged && !approved && (
        <div className="mt-4 border-t border-border pt-4 text-[12px] text-text-muted">
          La cotización ya está propuesta arriba. Cuando estés de acuerdo, dale a{' '}
          <strong>✓ Aprobar y crear tareas</strong> para materializarla.
        </div>
      )}
    </Card>
  )
}

function StreamingBubble({ text }: { text: string }) {
  const cleaned = stripDraftFence(text)
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-md px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap bg-bg-alt text-text border border-border">
        {cleaned.length === 0 ? (
          <span className="text-text-muted italic">El agente está pensando…</span>
        ) : (
          <>
            {cleaned}
            <span className="ml-0.5 inline-block w-2 h-3 bg-brand animate-pulse align-middle" />
          </>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: DiscoveryMessageDTO }) {
  const isUser = message.role === 'user'
  const cleaned = stripDraftFence(message.content)
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-md px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap ${
          isUser
            ? 'bg-brand/15 text-text border border-brand/30'
            : 'bg-bg-alt text-text border border-border'
        }`}
      >
        {cleaned}
        {!isUser && message.costCents > 0 && (
          <div className="mt-2 text-[10px] text-text-muted font-mono">
            {message.tokensIn}/{message.tokensOut} tok · ${(message.costCents / 100).toFixed(2)}
          </div>
        )}
      </div>
    </div>
  )
}

const DRAFT_FENCE_RE = /```stories-draft[\s\S]*?```/g
function stripDraftFence(text: string): string {
  return text.replace(DRAFT_FENCE_RE, '').trim()
}

function DraftReview({
  stories,
  approved,
  approving,
  onApprove,
  onRequestChanges,
}: {
  stories: DiscoveryStoryDraftDTO[]
  approved: boolean
  approving: boolean
  onApprove: () => void
  onRequestChanges?: () => void
}) {
  const totalHours = stories.reduce((acc, s) => acc + (s.estimatedHours ?? 0), 0)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <Eyebrow>Cotización propuesta ({stories.length})</Eyebrow>
        <span className="text-[12px] text-text-muted font-mono">
          {totalHours.toFixed(1)}h totales
        </span>
      </div>
      <div className="space-y-3">
        {stories.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: proposed stories have no stable id yet
          <div key={i} className="rounded-md border border-border bg-bg-alt p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-[13px] text-text">{s.title}</div>
              <Badge tone={priorityTone(s.priority)} outline>
                P{s.priority}
              </Badge>
            </div>
            <div className="mt-1 text-[12px] text-text-soft">{s.goal}</div>
            {s.acceptanceCriteria.length > 0 && (
              <ul className="mt-2 ml-4 list-disc text-[12px] text-text-muted">
                {s.acceptanceCriteria.map((c, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: criteria are plain strings without stable ids
                  <li key={j}>{c}</li>
                ))}
              </ul>
            )}
            <div className="mt-2 text-[11px] text-text-muted font-mono">≈ {s.estimatedHours}h</div>
          </div>
        ))}
      </div>
      {!approved && (
        <div className="mt-4 flex justify-end gap-2">
          {onRequestChanges && (
            <Button variant="ghost" onClick={onRequestChanges} disabled={approving}>
              ✎ Pedir ajustes
            </Button>
          )}
          <Button variant="turtle" onClick={onApprove} disabled={approving}>
            {approving ? 'Creando tareas…' : '✓ Aprobar y crear tareas'}
          </Button>
        </div>
      )}
      {approved && (
        <div className="mt-4 text-[12px] text-turtle">
          ✓ Cotización aprobada. Las tareas ya existen — cierra esta vista para verlas.
        </div>
      )}
    </div>
  )
}

function priorityTone(p: 1 | 2 | 3 | 4 | 5): 'danger' | 'warning' | 'brand' | 'neutral' | 'turtle' {
  if (p === 1) return 'danger'
  if (p === 2) return 'warning'
  if (p === 3) return 'brand'
  if (p === 4) return 'neutral'
  return 'turtle'
}
