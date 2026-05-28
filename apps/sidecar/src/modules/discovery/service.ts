import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import type {
  DiscoveryConversationWithMessagesDTO,
  DiscoveryMessageDTO,
  DiscoveryStoryDraftDTO,
} from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { DISCOVERY_SYSTEM_PROMPT } from './prompts'

const DEFAULT_MODEL = 'claude-opus-4-7'
const CLAUDE_BIN = process.env.TORTUGA_CLAUDE_BIN ?? 'claude'
const CLI_TIMEOUT_MS = 3 * 60_000

const PRICE_PER_MTOK: Record<string, { in: number; out: number }> = {
  'claude-opus-4-7': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
}

function computeCostCents(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICE_PER_MTOK[model]
  if (!p) return 0
  const usd = (tokensIn / 1_000_000) * p.in + (tokensOut / 1_000_000) * p.out
  return Math.round(usd * 100)
}

export async function startOrLoadConversation(
  projectCode: string,
  provider: 'anthropic-sdk' | 'claude-cli' = 'claude-cli',
): Promise<DiscoveryConversationWithMessagesDTO> {
  const result = await useCases.discovery.getOrStartConversation(coreDeps(), projectCode, provider)
  return unwrap(result)
}

export async function loadConversation(
  conversationId: string,
): Promise<DiscoveryConversationWithMessagesDTO> {
  const result = await useCases.discovery.getConversationWithMessages(coreDeps(), conversationId)
  return unwrap(result)
}

export type DiscoveryStreamEvent =
  | { type: 'user-saved'; message: DiscoveryMessageDTO }
  | { type: 'delta'; text: string }
  | {
      type: 'done'
      agentMessage: DiscoveryMessageDTO
      storiesDraft: DiscoveryStoryDraftDTO[] | null
    }
  | { type: 'error'; message: string }

/**
 * Streaming variant of sendUserMessage. Emits incremental events for the
 * SSE endpoint. The non-streaming sendUserMessage stays for clients that
 * don't need progressive UI.
 */
export async function streamUserMessage(
  conversationId: string,
  content: string,
  onEvent: (ev: DiscoveryStreamEvent) => void,
): Promise<void> {
  const deps = coreDeps()

  const userMessage = unwrap(
    await useCases.discovery.appendUserMessage(deps, conversationId, content),
  )
  onEvent({ type: 'user-saved', message: userMessage })

  const conv = unwrap(await useCases.discovery.getConversationWithMessages(deps, conversationId))

  let fullText = ''
  let model = DEFAULT_MODEL
  let tokensIn = 0
  let tokensOut = 0

  try {
    if (conv.conversation.provider === 'anthropic-sdk') {
      const result = await streamWithAnthropicSdk(conv.messages, (delta) => {
        fullText += delta
        onEvent({ type: 'delta', text: delta })
      })
      model = result.model
      tokensIn = result.tokensIn
      tokensOut = result.tokensOut
    } else {
      const result = await streamWithClaudeCli(conv.messages, (delta) => {
        fullText += delta
        onEvent({ type: 'delta', text: delta })
      })
      model = result.model
      tokensIn = result.tokensIn
      tokensOut = result.tokensOut
    }
  } catch (err) {
    onEvent({ type: 'error', message: (err as Error).message })
    return
  }

  const costCents = computeCostCents(model, tokensIn, tokensOut)

  const agentMessage = unwrap(
    await useCases.discovery.appendAgentMessage(deps, conversationId, {
      content: fullText,
      model,
      tokensIn,
      tokensOut,
      costCents,
    }),
  )

  const storiesDraft = extractStoriesDraft(fullText)
  if (storiesDraft) {
    unwrap(await useCases.discovery.attachStoriesDraft(deps, conversationId, storiesDraft))
  }

  onEvent({ type: 'done', agentMessage, storiesDraft })
}

export async function sendUserMessage(
  conversationId: string,
  content: string,
): Promise<{
  userMessage: DiscoveryMessageDTO
  agentMessage: DiscoveryMessageDTO
  storiesDraft: DiscoveryStoryDraftDTO[] | null
}> {
  const deps = coreDeps()

  const userMessage = unwrap(
    await useCases.discovery.appendUserMessage(deps, conversationId, content),
  )

  const conv = unwrap(await useCases.discovery.getConversationWithMessages(deps, conversationId))

  let reply: {
    text: string
    model: string
    tokensIn: number
    tokensOut: number
    cliSessionId?: string
  }
  if (conv.conversation.provider === 'anthropic-sdk') {
    reply = await runWithAnthropicSdk(conv.messages)
  } else {
    reply = await runWithClaudeCli(conv.messages)
  }

  const costCents = computeCostCents(reply.model, reply.tokensIn, reply.tokensOut)

  const agentMessage = unwrap(
    await useCases.discovery.appendAgentMessage(deps, conversationId, {
      content: reply.text,
      model: reply.model,
      tokensIn: reply.tokensIn,
      tokensOut: reply.tokensOut,
      costCents,
    }),
  )

  const storiesDraft = extractStoriesDraft(reply.text)
  if (storiesDraft) {
    unwrap(await useCases.discovery.attachStoriesDraft(deps, conversationId, storiesDraft))
  }

  return { userMessage, agentMessage, storiesDraft }
}

async function runWithAnthropicSdk(
  history: DiscoveryMessageDTO[],
): Promise<{ text: string; model: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in the sidecar environment')
  }
  const client = new Anthropic({ apiKey })
  const messages = history.map((m) => ({
    role: m.role === 'agent' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }))
  try {
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 2048,
      system: DISCOVERY_SYSTEM_PROMPT,
      messages,
    })
    let text = ''
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
    }
    const usage = response.usage as {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
    }
    const tokensIn = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
    const tokensOut = usage.output_tokens ?? 0
    return { text, model: response.model ?? DEFAULT_MODEL, tokensIn, tokensOut }
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'discovery: anthropic call failed')
    throw new Error(`discovery LLM call failed: ${(err as Error).message}`)
  }
}

async function runWithClaudeCli(history: DiscoveryMessageDTO[]): Promise<{
  text: string
  model: string
  tokensIn: number
  tokensOut: number
  cliSessionId: string
}> {
  const sessionId = randomUUID()
  const prompt = serializeTranscriptForCli(history)
  // Write system prompt to a file: passing it via CLI args breaks under
  // cmd.exe wrapping on Windows (multiline + special chars get mangled).
  const isolatedCwd = mkdtempSync(join(tmpdir(), 'tortuga-discovery-'))
  const systemPromptFile = join(isolatedCwd, 'system-prompt.txt')
  writeFileSync(systemPromptFile, DISCOVERY_SYSTEM_PROMPT, 'utf-8')

  const args = [
    '--print',
    '--output-format',
    'json',
    '--session-id',
    sessionId,
    '--model',
    'sonnet',
    '--system-prompt-file',
    systemPromptFile,
    '--disallowedTools',
    'Edit,Write,Bash,Read,Glob,Grep,WebFetch,WebSearch,NotebookEdit,Task',
  ]

  logger.info({ isolatedCwd, sessionId, promptLen: prompt.length }, 'discovery: spawning CLI')
  const isWin = process.platform === 'win32'
  const spawnCmd = isWin ? 'claude.cmd' : CLAUDE_BIN
  const child = spawn(spawnCmd, args, {
    cwd: isolatedCwd,
    windowsHide: true,
    shell: isWin,
  })
  let stdout = ''
  let stderr = ''
  const timer = setTimeout(() => {
    logger.warn({ sessionId }, 'discovery: CLI timeout — killing')
    child.kill('SIGTERM')
  }, CLI_TIMEOUT_MS)
  child.stdout.on('data', (b: Buffer) => {
    stdout += b.toString('utf-8')
  })
  child.stderr.on('data', (b: Buffer) => {
    const text = b.toString('utf-8')
    stderr += text
    logger.warn({ sessionId, stderr: text.trim() }, 'discovery: CLI stderr')
  })
  child.stdin.write(prompt)
  child.stdin.end()
  logger.info({ sessionId }, 'discovery: stdin closed, waiting for CLI response')

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(-1)
    })
  })

  if (exitCode !== 0) {
    logger.error({ exitCode, stderr }, 'discovery: claude-cli failed')
    throw new Error(`claude CLI exited with code ${exitCode}: ${stderr.slice(0, 500)}`)
  }

  // The CLI prints a single JSON object to stdout when --output-format=json.
  // Shape (subset): { type: 'result', subtype: 'success', result: '<text>',
  // session_id, total_cost_usd, usage: { input_tokens, output_tokens } }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(stdout)
  } catch (err) {
    logger.error({ stdoutPreview: stdout.slice(0, 500) }, 'discovery: invalid CLI JSON')
    throw new Error(`claude CLI returned non-JSON output: ${(err as Error).message}`)
  }

  const text = typeof parsed.result === 'string' ? parsed.result : ''
  const reportedSessionId = typeof parsed.session_id === 'string' ? parsed.session_id : sessionId
  const usage = parsed.usage as
    | { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
    | undefined
  const tokensIn = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0)
  const tokensOut = usage?.output_tokens ?? 0
  // The CLI doesn't expose `model` at top level; pick it from modelUsage keys.
  const modelUsage = parsed.modelUsage as Record<string, unknown> | undefined
  const detectedModel = modelUsage ? Object.keys(modelUsage)[0] : undefined
  const model = detectedModel ?? DEFAULT_MODEL

  return {
    text,
    model,
    tokensIn,
    tokensOut,
    cliSessionId: reportedSessionId,
  }
}

function serializeTranscriptForCli(history: DiscoveryMessageDTO[]): string {
  if (history.length === 0) return ''
  // Last message is always the user's latest input — render the previous
  // turns as conversation context and end with that final user turn.
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

async function streamWithAnthropicSdk(
  history: DiscoveryMessageDTO[],
  onDelta: (text: string) => void,
): Promise<{ model: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set in the sidecar environment')
  }
  const client = new Anthropic({ apiKey })
  const messages = history.map((m) => ({
    role: m.role === 'agent' ? ('assistant' as const) : ('user' as const),
    content: m.content,
  }))
  const stream = client.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    system: DISCOVERY_SYSTEM_PROMPT,
    messages,
  })
  stream.on('text', (delta: string) => onDelta(delta))
  const final = await stream.finalMessage()
  const usage = final.usage as {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
  }
  const tokensIn = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  const tokensOut = usage.output_tokens ?? 0
  return { model: final.model ?? DEFAULT_MODEL, tokensIn, tokensOut }
}

async function streamWithClaudeCli(
  history: DiscoveryMessageDTO[],
  onDelta: (text: string) => void,
): Promise<{ model: string; tokensIn: number; tokensOut: number }> {
  const sessionId = randomUUID()
  const prompt = serializeTranscriptForCli(history)
  // Write the system prompt to a temp file. Passing it as a CLI arg gets
  // mangled by cmd.exe on Windows (newlines + asterisks + backticks
  // become unusable), which silently downgrades the agent to its default
  // assistant persona.
  const isolatedCwd = mkdtempSync(join(tmpdir(), 'tortuga-discovery-'))
  const systemPromptFile = join(isolatedCwd, 'system-prompt.txt')
  writeFileSync(systemPromptFile, DISCOVERY_SYSTEM_PROMPT, 'utf-8')

  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--session-id',
    sessionId,
    '--model',
    'sonnet',
    '--system-prompt-file',
    systemPromptFile,
    '--disallowedTools',
    'Edit,Write,Bash,Read,Glob,Grep,WebFetch,WebSearch,NotebookEdit,Task',
  ]

  const isWin = process.platform === 'win32'
  const spawnCmd = isWin ? 'claude.cmd' : CLAUDE_BIN
  logger.info({ sessionId, promptLen: prompt.length }, 'discovery: spawning CLI (stream)')
  const child = spawn(spawnCmd, args, {
    cwd: isolatedCwd,
    windowsHide: true,
    shell: isWin,
  })

  let tokensIn = 0
  let tokensOut = 0
  let model = DEFAULT_MODEL
  let stderr = ''
  let lineBuf = ''
  const timer = setTimeout(() => child.kill('SIGTERM'), CLI_TIMEOUT_MS)

  child.stdout.on('data', (chunk: Buffer) => {
    lineBuf += chunk.toString('utf-8')
    while (true) {
      const idx = lineBuf.indexOf('\n')
      if (idx < 0) break
      const line = lineBuf.slice(0, idx).trim()
      lineBuf = lineBuf.slice(idx + 1)
      if (!line) continue
      try {
        const ev = JSON.parse(line) as Record<string, unknown>
        handleStreamEvent(ev, onDelta, (m, ti, to) => {
          model = m
          tokensIn = ti
          tokensOut = to
        })
      } catch {
        // ignore non-JSON noise
      }
    }
  })
  child.stderr.on('data', (b: Buffer) => {
    stderr += b.toString('utf-8')
  })
  child.stdin.write(prompt)
  child.stdin.end()

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(-1)
    })
  })

  if (exitCode !== 0) {
    throw new Error(`claude CLI exited with code ${exitCode}: ${stderr.slice(0, 500)}`)
  }

  return { model, tokensIn, tokensOut }
}

function handleStreamEvent(
  ev: Record<string, unknown>,
  onDelta: (text: string) => void,
  onFinish: (model: string, tokensIn: number, tokensOut: number) => void,
): void {
  const type = ev.type as string | undefined
  if (type === 'stream_event') {
    const inner = ev.event as Record<string, unknown> | undefined
    if (!inner) return
    if (inner.type === 'content_block_delta') {
      const delta = inner.delta as Record<string, unknown> | undefined
      if (delta && delta.type === 'text_delta' && typeof delta.text === 'string') {
        onDelta(delta.text)
      }
    }
    return
  }
  if (type === 'result') {
    const usage = ev.usage as
      | { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }
      | undefined
    const tokensIn = (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0)
    const tokensOut = usage?.output_tokens ?? 0
    const modelUsage = ev.modelUsage as Record<string, unknown> | undefined
    const detectedModel = modelUsage ? Object.keys(modelUsage)[0] : undefined
    onFinish(detectedModel ?? DEFAULT_MODEL, tokensIn, tokensOut)
    return
  }
}

const STORIES_FENCE_RE = /```stories-draft\s*\n([\s\S]*?)```/m

function extractStoriesDraft(text: string): DiscoveryStoryDraftDTO[] | null {
  const m = text.match(STORIES_FENCE_RE)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1]!)
    const stories = parsed?.stories
    if (!Array.isArray(stories)) return null
    return stories
      .map((s) => normalizeStory(s))
      .filter((s): s is DiscoveryStoryDraftDTO => s !== null)
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'discovery: failed to parse stories-draft JSON')
    return null
  }
}

function normalizeStory(raw: unknown): DiscoveryStoryDraftDTO | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.trim() : ''
  const goal = typeof o.goal === 'string' ? o.goal.trim() : ''
  if (!title || !goal) return null
  const acceptanceCriteria = Array.isArray(o.acceptanceCriteria)
    ? o.acceptanceCriteria.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : []
  const estimatedHours =
    typeof o.estimatedHours === 'number' && o.estimatedHours >= 0 ? o.estimatedHours : 4
  const rawPriority = typeof o.priority === 'number' ? o.priority : 3
  const priority = (rawPriority < 1 ? 1 : rawPriority > 5 ? 5 : Math.round(rawPriority)) as
    | 1
    | 2
    | 3
    | 4
    | 5
  return { title, goal, acceptanceCriteria, estimatedHours, priority }
}

export async function approveDraftAndMaterialize(conversationId: string): Promise<{
  conversationId: string
  storyIds: string[]
  taskIds: string[]
}> {
  const deps = coreDeps()
  const conv = await deps.storage.getDiscoveryConversationById(conversationId)
  if (!conv) throw new Error(`conversation ${conversationId} not found`)
  if (!conv.storiesDraftJson) {
    throw new Error(`conversation ${conversationId} has no stories draft to approve`)
  }
  if (conv.status === 'archived') {
    // Already materialized once. Return what's already on the quote so the
    // UI can navigate, instead of throwing a duplicate-code error.
    const project = await deps.storage.getProjectById(conv.projectId)
    if (!project) throw new Error(`project ${conv.projectId} not found`)
    const q = unwrap(await useCases.quotes.getCurrentQuote(deps, project.code))
    const existing = await deps.storage.listStoriesForQuote(q.id)
    const taskIds: string[] = []
    for (const s of existing) {
      const ts = await deps.storage.listTasksForStory(s.id)
      for (const t of ts) taskIds.push(t.id)
    }
    return { conversationId, storyIds: existing.map((s) => s.id), taskIds }
  }
  if (conv.status !== 'converged') {
    throw new Error(`conversation ${conversationId} has no stories draft to approve`)
  }

  const stories = JSON.parse(conv.storiesDraftJson) as DiscoveryStoryDraftDTO[]
  if (!Array.isArray(stories) || stories.length === 0) {
    throw new Error('stories draft is empty')
  }

  const project = await deps.storage.getProjectById(conv.projectId)
  if (!project) throw new Error(`project ${conv.projectId} not found`)
  const currentQuote = await useCases.quotes.getCurrentQuote(deps, project.code)
  const quote = unwrap(currentQuote)

  const existing = await deps.storage.listStoriesForQuote(quote.id)
  const existingByCode = new Map(existing.map((s) => [s.code.toUpperCase(), s]))
  const baseCode = project.code.toUpperCase()
  let max = 0
  for (const s of existing) {
    const m = s.code.match(new RegExp(`^${baseCode}-(\\d+)$`, 'i'))
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }

  const storyIds: string[] = []
  const taskIds: string[] = []

  // T0 — Arquitectura y scaffold. Idempotent: reuse if it already exists.
  const archStoryCode = `${baseCode}-000`
  const archGoal = stories.map((s, i) => `${i + 1}. ${s.title} — ${s.goal}`).join('\n')
  let archStoryId: string
  const existingArch = existingByCode.get(archStoryCode)
  if (existingArch) {
    archStoryId = existingArch.id
    const archTasks = await deps.storage.listTasksForStory(existingArch.id)
    for (const t of archTasks) taskIds.push(t.id)
  } else {
    const archStory = unwrap(
      await useCases.stories.createStory(deps, {
        quoteId: quote.id,
        code: archStoryCode,
        title: 'Arquitectura y scaffold',
        goal: 'Definir el stack, scaffoldar el proyecto y dejar ARCHITECTURE.md como fuente de verdad antes de implementar features.',
        acceptanceCriteriaJson: JSON.stringify([
          'El proyecto físico está scaffoldado (compila sin errores)',
          'ARCHITECTURE.md existe en la raíz del workspace y describe stack, layout y decisiones',
          'pubspec.yaml / package.json tiene las dependencias acordadas',
          'Las siguientes stories pueden arrancar leyendo ARCHITECTURE.md',
        ]),
        inputsJson: JSON.stringify({ pendingStories: archGoal }),
        outputsJson: '{}',
        verificationJson: '{}',
        outOfScopeJson: '[]',
        estimatedHoursMin: 60,
        priority: 1,
        ownerRole: 'tech_lead',
      }),
    )
    archStoryId = archStory.id
    const archTask = unwrap(
      await useCases.tasks.createTask(deps, {
        storyId: archStory.id,
        code: `${archStoryCode}-T1`,
        type: 'arch',
        ownerRole: 'tech_lead',
        estimatedHoursMin: 60,
      }),
    )
    taskIds.push(archTask.id)
  }
  storyIds.push(archStoryId)

  for (const draft of stories) {
    max += 1
    const code = `${baseCode}-${String(max).padStart(3, '0')}`
    // Idempotent: skip if this code already exists in the quote.
    const dup = existingByCode.get(code)
    if (dup) {
      storyIds.push(dup.id)
      const tasksOfDup = await deps.storage.listTasksForStory(dup.id)
      for (const t of tasksOfDup) taskIds.push(t.id)
      continue
    }
    const storyResult = await useCases.stories.createStory(deps, {
      quoteId: quote.id,
      code,
      title: draft.title,
      goal: draft.goal,
      acceptanceCriteriaJson: JSON.stringify(draft.acceptanceCriteria),
      inputsJson: '{}',
      outputsJson: '{}',
      verificationJson: '{}',
      outOfScopeJson: '[]',
      estimatedHoursMin: Math.round(draft.estimatedHours * 60),
      priority: draft.priority,
      ownerRole: 'dev',
    })
    const story = unwrap(storyResult)
    storyIds.push(story.id)

    const taskResult = await useCases.tasks.createTask(deps, {
      storyId: story.id,
      code: `${code}-T1`,
      type: 'impl',
      ownerRole: 'dev',
      estimatedHoursMin: Math.round(draft.estimatedHours * 60),
    })
    const task = unwrap(taskResult)
    taskIds.push(task.id)
  }

  unwrap(await useCases.discovery.approveAndMaterialize(deps, conversationId))

  return { conversationId, storyIds, taskIds }
}
