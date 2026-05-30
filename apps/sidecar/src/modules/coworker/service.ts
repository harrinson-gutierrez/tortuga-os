import { systemPromptFor } from '@tortuga-os/agent-runner'
import type {
  AgentKind,
  ProjectStack,
  TaskConversationWithMessagesDTO,
  TaskCoworkerPhase,
  TaskExecutionMode,
  TaskMessageDTO,
} from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import type { AgentRunRow, TaskRow } from '@tortuga-os/core'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { buildUserPrompt } from '../agent-runs/build-prompt'
import { PHASE_INSTRUCTIONS } from './phase-prompts'

// Tight poll so the SSE delta stream feels live (the worker writes output
// chunks to the DB as the CLI emits them; we relay them to the chat).
const RUN_POLL_INTERVAL_MS = 500
const RUN_TIMEOUT_MS = 30 * 60_000
const TERMINAL_STATUSES: ReadonlySet<AgentRunRow['status']> = new Set([
  'succeeded',
  'failed',
  'cancelled',
])

export async function getOrStartConversation(
  taskId: string,
  provider: 'anthropic-sdk' | 'claude-cli' = 'claude-cli',
): Promise<TaskConversationWithMessagesDTO> {
  return unwrap(await useCases.coworker.getOrStartConversation(coreDeps(), taskId, provider))
}

export async function loadConversation(
  conversationId: string,
): Promise<TaskConversationWithMessagesDTO> {
  return unwrap(await useCases.coworker.getConversationWithMessages(coreDeps(), conversationId))
}

export async function setPhase(
  conversationId: string,
  phase: TaskCoworkerPhase,
): Promise<TaskConversationWithMessagesDTO> {
  return unwrap(await useCases.coworker.setPhase(coreDeps(), conversationId, phase))
}

export async function setExecutionMode(taskId: string, mode: TaskExecutionMode) {
  return unwrap(await useCases.coworker.setExecutionMode(coreDeps(), taskId, mode))
}

export type CoworkerStreamEvent =
  | { type: 'user-saved'; message: TaskMessageDTO }
  | { type: 'run-queued'; runId: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; agentMessage: TaskMessageDTO; runId: string }
  | { type: 'error'; message: string }

/**
 * Start a coworker turn: persist the user message, create an EMPTY agent
 * placeholder bound to a freshly-queued run, and return immediately. The run
 * executes in the background worker; its post-hook (worker.ts) fills the
 * placeholder when it finishes — so the turn survives the operator navigating
 * away or closing the app. Nothing here waits for the run.
 */
async function startTurn(
  conversationId: string,
  content: string,
): Promise<{ userMessage: TaskMessageDTO; agentMessage: TaskMessageDTO; runId: string }> {
  const deps = coreDeps()
  const conv = await deps.storage.getTaskConversationById(conversationId)
  if (!conv) throw new Error(`task conversation ${conversationId} not found`)
  const task = await deps.storage.getTaskById(conv.taskId)
  if (!task) throw new Error(`task ${conv.taskId} not found`)

  const userRow = await deps.storage.appendTaskMessage({
    id: deps.newId(),
    conversationId,
    role: 'user',
    content,
    phase: conv.phase,
    now: deps.now(),
  })

  const history = await deps.storage.listTaskMessages(conversationId)
  const brief = await buildUserPrompt(task.id, undefined)
  const transcript = serializeTaskTranscript(history)
  const userPrompt = [brief, transcript, PHASE_INSTRUCTIONS[conv.phase]]
    .filter((s) => s.trim().length > 0)
    .join('\n\n')

  const agentKind = await devAgentKindForTask(task)
  const queued = unwrap(
    await useCases.agentRuns.queueAgentRun(deps, {
      taskId: task.id,
      agentKind,
      provider: 'claude-cli',
      systemPrompt: systemPromptFor(agentKind),
      userPrompt,
    }),
  )

  const agentRow = await deps.storage.appendTaskMessage({
    id: deps.newId(),
    conversationId,
    role: 'agent',
    content: '',
    agentRunId: queued.id,
    phase: conv.phase,
    now: deps.now(),
  })

  logger.info({ conversationId, runId: queued.id, phase: conv.phase }, 'coworker: queued turn run')
  const reload = unwrap(await useCases.coworker.getConversationWithMessages(deps, conversationId))
  return {
    userMessage: reload.messages.find((m) => m.id === userRow.id)!,
    agentMessage: reload.messages.find((m) => m.id === agentRow.id)!,
    runId: queued.id,
  }
}

export async function sendUserMessage(
  conversationId: string,
  content: string,
): Promise<{ userMessage: TaskMessageDTO; agentMessage: TaskMessageDTO; runId: string }> {
  const { userMessage, runId } = await startTurn(conversationId, content)
  const run = await waitForRun(runId)
  const agentMessage = await finalizeAgentTurn(runId, run)
  return { userMessage, agentMessage, runId }
}

export async function streamUserMessage(
  conversationId: string,
  content: string,
  onEvent: (ev: CoworkerStreamEvent) => void,
): Promise<void> {
  let started: Awaited<ReturnType<typeof startTurn>>
  try {
    started = await startTurn(conversationId, content)
  } catch (err) {
    onEvent({ type: 'error', message: (err as Error).message })
    return
  }
  onEvent({ type: 'user-saved', message: started.userMessage })
  onEvent({ type: 'run-queued', runId: started.runId })

  // The run is already executing in the worker; we only tail it for the live
  // view. If this SSE connection drops, the worker post-hook still completes
  // the placeholder — the turn never gets lost.
  try {
    const run = await waitForRun(started.runId, (chunk) => {
      if (chunk) onEvent({ type: 'delta', text: chunk })
    })
    const agentMessage = await finalizeAgentTurn(started.runId, run)
    onEvent({ type: 'done', agentMessage, runId: started.runId })
  } catch (err) {
    onEvent({ type: 'error', message: (err as Error).message })
  }
}

async function waitForRun(
  runId: string,
  onProgress?: (chunk: string, runId: string) => void,
): Promise<AgentRunRow> {
  const deps = coreDeps()
  const deadline = Date.now() + RUN_TIMEOUT_MS
  let lastOutputLen = 0
  while (Date.now() < deadline) {
    const run = await deps.storage.getAgentRunById(runId)
    if (!run) throw new Error(`agent run ${runId} disappeared`)
    if (onProgress && run.output && run.output.length > lastOutputLen) {
      onProgress(run.output.slice(lastOutputLen), runId)
      lastOutputLen = run.output.length
    }
    if (TERMINAL_STATUSES.has(run.status)) return run
    await sleep(RUN_POLL_INTERVAL_MS)
  }
  throw new Error(`agent run ${runId} timed out after ${RUN_TIMEOUT_MS}ms`)
}

/**
 * Fill the agent placeholder message for a finished run with its output +
 * metrics. Idempotent and owned by both the SSE tail and the worker post-hook
 * (completeCoworkerTurn) — whichever observes the terminal run first wins; the
 * other no-ops because the content already matches.
 */
export async function finalizeAgentTurn(runId: string, run: AgentRunRow): Promise<TaskMessageDTO> {
  const deps = coreDeps()
  const msg = await deps.storage.getTaskMessageByAgentRunId(runId)
  if (!msg) throw new Error(`no coworker message for run ${runId}`)
  const content =
    run.status === 'succeeded'
      ? (run.output ?? '')
      : (run.output ?? '') ||
        `El turno del agente terminó en estado ${run.status}: ${run.errorMessage ?? 'sin detalle'}`
  await deps.storage.updateTaskMessage({
    id: msg.id,
    content,
    model: run.model,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
    costCents: run.costCents,
    now: deps.now(),
  })
  return unwrap(
    await useCases.coworker.getConversationWithMessages(deps, msg.conversationId),
  ).messages.find((m) => m.id === msg.id)!
}

/**
 * Worker post-hook entry point: a coworker turn's run just closed. Complete its
 * placeholder message regardless of whether any SSE connection is still open.
 * Returns false if the run isn't a coworker turn.
 */
export async function completeCoworkerTurn(runId: string): Promise<boolean> {
  const deps = coreDeps()
  const msg = await deps.storage.getTaskMessageByAgentRunId(runId)
  if (!msg) return false
  const run = await deps.storage.getAgentRunById(runId)
  if (!run) return false
  await finalizeAgentTurn(runId, run)
  return true
}

/**
 * Renders previous turns as labeled context and ends with the latest user
 * message — same shape as the discovery transcript.
 */
export function serializeTaskTranscript(history: { role: string; content: string }[]): string {
  if (history.length === 0) return ''
  const lines: string[] = []
  if (history.length > 1) {
    lines.push('=== Conversación previa ===')
    for (const m of history.slice(0, -1)) {
      const tag = m.role === 'agent' ? 'Asistente' : 'Usuario'
      lines.push(`\n${tag}:\n${m.content}`)
    }
    lines.push('\n=== Mensaje actual del usuario ===')
  }
  const last = history[history.length - 1]!
  lines.push(last.content)
  return lines.join('\n')
}

/**
 * Pick the dev agent for a task from its project stack, mirroring the client
 * selection logic (arch→arch, non-impl→dev, then stack-specialized dev).
 */
async function devAgentKindForTask(task: TaskRow): Promise<AgentKind> {
  if (task.type === 'arch') return 'arch'
  if (task.type !== 'impl') return 'dev'
  const stack = await projectStackForTask(task)
  if (stack?.startsWith('flutter')) return 'dev-flutter'
  if (stack === 'nextjs-supabase') return 'dev-nextjs'
  if (stack === 'vite-react') return 'dev-vite-react'
  if (stack === 'node-fastify') return 'dev-node'
  return 'dev'
}

async function projectStackForTask(task: TaskRow): Promise<ProjectStack | null> {
  const deps = coreDeps()
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  return project?.stack ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
