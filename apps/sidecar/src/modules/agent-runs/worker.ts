import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  type AgentRunOutcome,
  type AgentRunner,
  AnthropicSdkRunner,
  ClaudeCliRunner,
} from '@tortuga-os/agent-runner'
import type { AgentProvider } from '@tortuga-os/contracts'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { coreDeps } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { handleDesignerOutput } from '../design/designer-output'
import { handleFrameAssignerOutput } from '../design/frame-assigner'
import { renderSkillsBlock, resolveSkillsForRun, skillsRootPath } from '../skills/use-cases'
import { parseDiagnosisFromOutput } from '../troubleshoot/diagnosis-parser'
import { notifyTroubleshootOutcome, recordEvidenceForReport } from '../troubleshoot/evidence'
import { workspacePathFor } from '../workspace/use-cases'

const MAX_CONCURRENT = 2
const POLL_INTERVAL_MS = 2000

const ROLE_MODEL_OVERRIDES: Record<string, string> = {
  arch: 'claude-opus-4-7',
  tech_lead: 'claude-opus-4-7',
  dev: 'claude-opus-4-7',
  'dev-flutter': 'claude-opus-4-7',
  'dev-nextjs': 'claude-opus-4-7',
  'dev-vite-react': 'claude-opus-4-7',
  'dev-node': 'claude-opus-4-7',
  designer: 'claude-opus-4-7',
  troubleshooter: 'claude-opus-4-7',
  qa: 'claude-sonnet-4-6',
  sales: 'claude-sonnet-4-6',
  pm: 'claude-sonnet-4-6',
}

const SESSION_RESET_KINDS = new Set<string>(['qa'])

const CANON_DOCS = [
  'docs/DOMAIN.md',
  'docs/PHASES-WORKFLOW.md',
  'docs/ROLES.md',
  'docs/REWORK-MODEL.md',
  'docs/STORY-FORMAT.md',
]

function injectWorkspaceRoot(userPrompt: string, workspaceAbs: string): string {
  const header = [
    '# Workspace context',
    '',
    `WORKSPACE_ROOT=${workspaceAbs}`,
    '',
    'Reglas duras de rutas:',
    '- Trata WORKSPACE_ROOT como el ÚNICO root del proyecto activo.',
    '- Todas las rutas que escribas (Read/Edit/Write/Glob) deben ser ABSOLUTAS bajo WORKSPACE_ROOT, o relativas a él.',
    '- NO uses rutas tipo `05-build/...` sin prefijar WORKSPACE_ROOT. La raíz del repo Tortuga NO es tu workspace.',
    '- Si una ruta no existe bajo WORKSPACE_ROOT, NO inventes paths alternativos: lista el dir padre con Glob y corrige.',
    '',
  ].join('\n')
  return `${header}\n${userPrompt}`
}

function findRepoRoot(startDir: string): string | null {
  let cur = resolve(startDir)
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(cur, 'pnpm-workspace.yaml')) ||
      existsSync(join(cur, 'tortuga.config.json'))
    ) {
      return cur
    }
    const parent = dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
  return null
}

let canonBundleCache: { hash: string; body: string } | null = null

function readCanonBundle(): string {
  const repoRoot = findRepoRoot(__dirname) ?? findRepoRoot(process.cwd())
  if (!repoRoot) return ''
  const parts: Array<{ path: string; body: string }> = []
  for (const rel of CANON_DOCS) {
    const abs = join(repoRoot, rel)
    if (!existsSync(abs)) continue
    try {
      const body = readFileSync(abs, 'utf-8')
      parts.push({ path: rel, body })
    } catch {
      /* unreadable doc skipped */
    }
  }
  if (parts.length === 0) return ''
  const hashSrc = parts.map((p) => `${p.path}:${p.body.length}`).join('|')
  const hash = createHash('sha1').update(hashSrc).digest('hex').slice(0, 12)
  if (canonBundleCache && canonBundleCache.hash === hash) {
    return canonBundleCache.body
  }
  const body = [
    '# Tortuga OS canon (read-only context)',
    '',
    'Estos documentos son la fuente de verdad del orquestador. NO necesitas',
    'abrirlos con Read: ya están incluidos aquí.',
    '',
    ...parts.flatMap((p) => [`## ${p.path}`, '', p.body, '']),
  ].join('\n')
  canonBundleCache = { hash, body }
  return body
}

function uuidFromSeed(seed: string): string {
  const hex = createHash('sha1').update(seed).digest('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

function buildSessionId(agentKind: string, runId: string, parentPhaseId: string | null): string {
  // Derive the Claude CLI session id from the run id, which the database
  // guarantees is unique. The earlier scheme keyed the id on
  // (phase, kind, attemptIndex), where attemptIndex was a count of prior
  // runs — under fast retries (gate-fixer relaunched 2-3×) two queued runs
  // could read the same count before either committed, produce the SAME
  // session id, and the second hit "Session ID is already in use" (the CLI
  // burns an id once consumed). Keying on run.id removes that race entirely:
  // every run gets its own session. Cross-role runs never shared a session
  // anyway. Standalone kinds (qa, etc.) still get a fully random id.
  if (SESSION_RESET_KINDS.has(agentKind) || !parentPhaseId) {
    return randomUUID()
  }
  return uuidFromSeed(`tortuga-run:${runId}`)
}

function parseJsonObjectSafely(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, string>
  } catch {
    /* fall through */
  }
  return {}
}

function parseJsonStringArraySafely(s: string): string[] {
  try {
    const v = JSON.parse(s)
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[]
  } catch {
    /* fall through */
  }
  return []
}

const runnersByProvider: Partial<Record<AgentProvider, AgentRunner>> = {
  'claude-cli': new ClaudeCliRunner(),
  'anthropic-sdk': new AnthropicSdkRunner(),
}

const inFlight = new Map<string, AgentRunner>()
let stopped = false

const SYSTEM_AGENT_PERSON_ID = 'person-agent-bot'

async function safeEnqueueRunInbox(
  deps: CoreDeps,
  args: {
    kind: 'agent_run_failed' | 'agent_run_succeeded'
    title: string
    body: string | null
    projectId: string | null
    taskId: string | null
    runId: string
  },
): Promise<void> {
  try {
    await useCases.inbox.enqueueInboxItem(deps, {
      kind: args.kind,
      title: args.title,
      ...(args.body !== null ? { body: args.body } : {}),
      ...(args.projectId !== null ? { projectId: args.projectId } : {}),
      ...(args.taskId !== null ? { taskId: args.taskId } : {}),
      runId: args.runId,
    })
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, runId: args.runId },
      'agent-runs: inbox enqueue failed (run close already committed)',
    )
  }
}

async function findReportForDiagnosisRun(
  deps: CoreDeps,
  runId: string,
): Promise<{ id: string; status: string } | null> {
  // Reports waiting on a diagnose run can be in any of the "in-flight"
  // statuses: diagnosing (first attempt) or testing/awaiting-operator
  // (retry after a failed test). We scan all of those.
  const candidates = (
    await Promise.all([
      deps.storage.listTroubleshootReportsByStatus('diagnosing'),
      deps.storage.listTroubleshootReportsByStatus('testing'),
      deps.storage.listTroubleshootReportsByStatus('awaiting-operator'),
    ])
  ).flat()
  const match = candidates.find((r) => r.lastDiagnosisRunId === runId)
  if (!match) return null
  return { id: match.id, status: match.status }
}

async function handleTroubleshooterDiagnosis(
  deps: CoreDeps,
  runId: string,
  output: string,
): Promise<void> {
  const report = await findReportForDiagnosisRun(deps, runId)
  if (!report) {
    logger.warn(
      { runId },
      'troubleshooter run finished but no matching report found — skipping diagnosis attach',
    )
    return
  }
  const parsed = parseDiagnosisFromOutput(output)
  if (!parsed.ok) {
    logger.warn(
      { runId, reportId: report.id, reason: parsed.reason },
      'troubleshooter output did not contain a valid diagnosis JSON; escalating',
    )
    await deps.storage.patchTroubleshootReport({
      id: report.id,
      now: Date.now(),
      status: 'escalated',
    })
    await recordEvidenceForReport(deps, report.id, {
      at: Date.now(),
      kind: 'escalated',
      detail: 'agent output had no valid diagnosis JSON',
    })
    await notifyTroubleshootOutcome(deps, report.id, 'escalated')
    return
  }
  const attached = await useCases.troubleshoot.attachDiagnosis(deps, {
    reportId: report.id,
    diagnosis: parsed.diagnosis,
    runId,
  })
  if (!attached.ok) {
    logger.warn(
      { runId, reportId: report.id, error: attached.error },
      'troubleshooter attachDiagnosis failed',
    )
    return
  }
  await recordEvidenceForReport(deps, report.id, {
    at: Date.now(),
    kind: 'diagnosed',
    detail: `confidence ${parsed.diagnosis.confidence}, next status ${attached.value.status}`,
    data: {
      proposedFiles: parsed.diagnosis.proposedFiles.length,
      proposedSql: parsed.diagnosis.proposedSql.length,
      operatorActions: parsed.diagnosis.requiredOperatorActions.length,
    },
  })
  logger.info(
    {
      runId,
      reportId: report.id,
      nextStatus: attached.value.status,
      confidence: parsed.diagnosis.confidence,
      proposedFiles: parsed.diagnosis.proposedFiles.length,
      proposedSql: parsed.diagnosis.proposedSql.length,
      operatorActions: parsed.diagnosis.requiredOperatorActions.length,
    },
    'troubleshooter: diagnosis attached',
  )
}

async function ensureAgentBotPerson(deps: CoreDeps): Promise<string> {
  const existing = await deps.storage.getPersonById(SYSTEM_AGENT_PERSON_ID)
  if (existing) return existing.id
  await deps.storage.createPerson({
    id: SYSTEM_AGENT_PERSON_ID,
    name: 'Agent Bot',
    email: null,
  })
  return SYSTEM_AGENT_PERSON_ID
}

async function resolveWorkspaceForTask(
  deps: CoreDeps,
  taskId: string,
): Promise<{
  path: string
  projectId: string
  stack: string
  disabledSkills: string[]
  phaseId: string
} | null> {
  const task = await deps.storage.getTaskById(taskId)
  if (!task) return null
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) return null
  let disabledSkills: string[] = []
  try {
    const parsed = JSON.parse(project.disabledSkillsJson)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      disabledSkills = parsed
    }
  } catch {
    /* corrupt JSON falls back to no disables */
  }
  return {
    phaseId: phase.id,
    path: project.workspacePath ?? workspacePathFor(project.code),
    projectId: project.id,
    stack: project.stack,
    disabledSkills,
  }
}

async function processOneRun(deps: CoreDeps, runId: string): Promise<void> {
  const run = await deps.storage.getAgentRunById(runId)
  if (!run) return
  if (run.status !== 'queued') return

  const runner = runnersByProvider[run.provider]
  if (!runner) {
    await deps.storage.closeAgentRunUnsuccessful({
      runId: run.id,
      status: 'failed',
      errorMessage: `provider not available: ${run.provider}`,
      output: '',
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      startedAt: Date.now(),
      closedAt: Date.now(),
    })
    return
  }

  const wsCtx = await resolveWorkspaceForTask(deps, run.taskId)
  if (!wsCtx) {
    await deps.storage.closeAgentRunUnsuccessful({
      runId: run.id,
      status: 'failed',
      errorMessage: 'could not resolve workspace path for the task',
      output: '',
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
      startedAt: Date.now(),
      closedAt: Date.now(),
    })
    return
  }
  const workspace = wsCtx.path

  try {
    mkdirSync(workspace, { recursive: true })
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'agent-runs: workspace mkdir failed')
  }

  // Decrypt every secret of the project into env vars for this agent run.
  // The agent sees real API keys etc. via process.env; on log capture the
  // values are NOT echoed back (they're handed to the subprocess at spawn).
  const secretEnv = await useCases.secrets
    .decryptSecretsForProject(deps, wsCtx.projectId)
    .catch((err) => {
      logger.warn(
        { err: (err as Error).message },
        'agent-runs: failed to decrypt project secrets — agent runs without them',
      )
      return {} as Record<string, string>
    })

  const startedAt = Date.now()
  await deps.storage.updateAgentRunStarted({ id: run.id, now: startedAt })
  inFlight.set(run.id, runner)
  logger.info({ runId: run.id, provider: run.provider, model: run.model }, 'agent-run: started')

  // Load every enabled MCP for the active project and convert it to the
  // wire shape the agent runner expects. JSON columns are decoded here
  // so the runner's port stays clean (no JSON parsing in the adapter).
  // MCPs are scoped per-project: a Supabase MCP in project A points at
  // a different Supabase ref than the one in project B.
  const mcpRows = await deps.storage.listProjectMcps(wsCtx.projectId)
  const mcpServers = mcpRows
    .filter((m) => m.enabled)
    .map((m) => {
      const env = parseJsonObjectSafely(m.envJson)
      const headers = parseJsonObjectSafely(m.headersJson)
      const argsArr = parseJsonStringArraySafely(m.argsJson)
      if (m.transport === 'http') {
        return {
          name: m.name,
          url: m.url ?? '',
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
        }
      }
      return {
        name: m.name,
        command: m.command,
        ...(argsArr.length > 0 ? { args: argsArr } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
      }
    })

  const activeSkills = resolveSkillsForRun({
    agentKind: run.agentKind,
    stack: wsCtx.stack as never,
    disabledSkills: wsCtx.disabledSkills,
  })
  const skillsBlock = renderSkillsBlock(activeSkills)
  const systemPromptWithSkills = skillsBlock
    ? `${skillsBlock}\n${run.systemPrompt}`
    : run.systemPrompt
  const skillsRoot = skillsRootPath()
  const extraReadDirs = activeSkills.length > 0 && existsSync(skillsRoot) ? [skillsRoot] : []
  logger.info(
    {
      runId: run.id,
      agentKind: run.agentKind,
      stack: wsCtx.stack,
      activeSkills,
      skillsBlockBytes: skillsBlock.length,
      skillsRoot,
      skillsRootExists: existsSync(skillsRoot),
      extraReadDirs,
    },
    'agent-runs: resolved skills for run',
  )

  // Dump the actual prompt the agent received so the operator can audit
  // what the model saw (skills block + system prompt + the user brief).
  // Writing this BEFORE the run starts means we still have a record
  // even if the run is cancelled or crashes mid-flight.
  try {
    const promptEvidenceDir = join(workspace, '05-build', '_agent-runs')
    mkdirSync(promptEvidenceDir, { recursive: true })
    writeFileSync(
      join(promptEvidenceDir, `${run.id}.system-prompt.md`),
      systemPromptWithSkills,
      'utf-8',
    )
    writeFileSync(join(promptEvidenceDir, `${run.id}.user-prompt.md`), run.userPrompt, 'utf-8')
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, runId: run.id },
      'agent-runs: failed to dump prompt evidence (non-fatal)',
    )
  }

  const canonBundle = readCanonBundle()
  const userPromptWithRoot = injectWorkspaceRoot(
    canonBundle ? `${canonBundle}\n\n${run.userPrompt}` : run.userPrompt,
    workspace,
  )
  const sessionId = buildSessionId(run.agentKind, run.id, wsCtx.phaseId)
  const effectiveModel = ROLE_MODEL_OVERRIDES[run.agentKind] ?? run.model

  let outcome: AgentRunOutcome
  try {
    outcome = await runner.run(
      {
        runId: run.id,
        agentKind: run.agentKind,
        systemPrompt: systemPromptWithSkills,
        userPrompt: userPromptWithRoot,
        model: effectiveModel,
        workspacePath: workspace,
        sessionId,
        ...(mcpServers.length > 0 ? { mcpServers } : {}),
        ...(Object.keys(secretEnv).length > 0 ? { env: secretEnv } : {}),
        ...(extraReadDirs.length > 0 ? { extraReadDirs } : {}),
      },
      {
        onChunk(text) {
          deps.storage
            .appendAgentRunOutput({ id: run.id, chunk: text, now: Date.now() })
            .catch(() => {})
        },
      },
    )
  } catch (err) {
    outcome = {
      kind: 'failed',
      errorMessage: (err as Error).message,
      output: '',
      tokensIn: 0,
      tokensOut: 0,
      costCents: 0,
    }
  } finally {
    inFlight.delete(run.id)
  }

  const closedAt = Date.now()

  if (outcome.kind === 'succeeded') {
    const botPersonId = await ensureAgentBotPerson(deps)
    const workEntryId = deps.newId()
    const evidenceId = deps.newId()
    const evidenceDir = join(workspace, '05-build', '_agent-runs')
    mkdirSync(evidenceDir, { recursive: true })
    const evidenceAbs = join(evidenceDir, `${run.id}.md`)
    writeFileSync(evidenceAbs, outcome.output, 'utf-8')

    await deps.storage.closeAgentRunSucceeded({
      runId: run.id,
      output: outcome.output,
      tokensIn: outcome.tokensIn,
      tokensOut: outcome.tokensOut,
      costCents: outcome.costCents,
      startedAt,
      closedAt,
      botPersonId,
      workEntryId,
      evidenceId,
      evidencePath: `05-build/_agent-runs/${run.id}.md`,
    })
    logger.info(
      {
        runId: run.id,
        tokensIn: outcome.tokensIn,
        tokensOut: outcome.tokensOut,
        costCents: outcome.costCents,
      },
      'agent-run: succeeded',
    )

    // Post-run hook for the troubleshooter: parse the structured JSON
    // diagnosis the agent emits and attach it to the report. On parse
    // failure we mark the report `escalated` with the raw output so the
    // operator can rediagnose manually instead of looping silently.
    if (run.agentKind === 'troubleshooter') {
      await handleTroubleshooterDiagnosis(deps, run.id, outcome.output)
    }

    // Designer runs (F3): parse the emitted frames + tokens and persist
    // them as design_frames, decoding each baseline screenshot to disk for
    // the G5 fidelity gate.
    if (run.agentKind === 'designer') {
      await handleDesignerOutput(deps, run.id, outcome.output)
    }

    // Frame-assigner runs: apply the frame→story assignments the agent
    // produced, distributing the pooled project frames to build stories.
    if (run.agentKind === 'frame-assigner') {
      await handleFrameAssignerOutput(deps, run.id, outcome.output)
    }

    await safeEnqueueRunInbox(deps, {
      kind: 'agent_run_succeeded',
      title: `Agent ${run.agentKind} terminó OK`,
      body: `Run ${run.id} (${outcome.tokensIn} in / ${outcome.tokensOut} out tokens · ${outcome.costCents}¢)`,
      projectId: wsCtx.projectId,
      taskId: run.taskId,
      runId: run.id,
    })
    return
  }

  await deps.storage.closeAgentRunUnsuccessful({
    runId: run.id,
    status: outcome.kind === 'cancelled' ? 'cancelled' : 'failed',
    errorMessage: outcome.kind === 'failed' ? outcome.errorMessage : 'cancelled',
    output: outcome.output,
    tokensIn: outcome.tokensIn,
    tokensOut: outcome.tokensOut,
    costCents: outcome.costCents,
    startedAt,
    closedAt,
  })
  logger.warn({ runId: run.id, kind: outcome.kind }, 'agent-run: closed unsuccessful')
  if (outcome.kind === 'failed') {
    await safeEnqueueRunInbox(deps, {
      kind: 'agent_run_failed',
      title: `Agent ${run.agentKind} falló`,
      body: outcome.errorMessage,
      projectId: wsCtx.projectId,
      taskId: run.taskId,
      runId: run.id,
    })
  }
}

async function tick(): Promise<void> {
  if (stopped) return
  const deps = coreDeps()
  if (inFlight.size >= MAX_CONCURRENT) return
  const queued = await deps.storage.listAgentRunsByStatus('queued')
  for (const run of queued) {
    if (inFlight.size >= MAX_CONCURRENT) break
    if (inFlight.has(run.id)) continue
    // Fire and forget; processOneRun owns its lifecycle.
    void processOneRun(deps, run.id).catch((err) => {
      logger.error({ err: (err as Error).message, runId: run.id }, 'agent-run: tick error')
    })
  }
}

let interval: NodeJS.Timeout | null = null

// A run is only "orphaned" if it's been stuck in `running` long enough
// that it can't possibly belong to a worker that's actually progressing.
// Live Claude CLI runs emit output every few seconds, so anything that
// has gone STALE_RUN_MS without updates is dead for sure. Short-lived
// reboots (sidecar rebuilt while a run was 30s in) used to wipe live
// runs and confused the operator — this threshold protects them.
const STALE_RUN_MS = 5 * 60_000 // 5 minutes

async function reapOrphanedRuns(): Promise<void> {
  const deps = coreDeps()
  const running = await deps.storage.listAgentRunsByStatus('running')
  if (running.length === 0) return
  const now = Date.now()
  let reaped = 0
  let skipped = 0
  for (const run of running) {
    const lastSeen = run.updatedAt ?? run.startedAt ?? run.createdAt ?? 0
    const ageMs = now - lastSeen
    if (ageMs < STALE_RUN_MS) {
      skipped++
      continue
    }
    await deps.storage.closeAgentRunUnsuccessful({
      runId: run.id,
      status: 'cancelled',
      errorMessage: `orphaned run reaped after ${Math.round(ageMs / 1000)}s of inactivity`,
      output: run.output ?? '',
      tokensIn: run.tokensIn ?? 0,
      tokensOut: run.tokensOut ?? 0,
      costCents: run.costCents ?? 0,
      startedAt: run.startedAt ?? now,
      closedAt: now,
    })
    reaped++
  }
  if (reaped > 0 || skipped > 0) {
    logger.warn(
      { reaped, skippedStillFresh: skipped, staleThresholdMs: STALE_RUN_MS },
      'agent-run worker: reap pass complete',
    )
  }
}

const STALE_TROUBLESHOOT_MS = 5 * 60_000

async function reapStuckTroubleshootReports(): Promise<void> {
  const deps = coreDeps()
  const inFlightStatuses = ['applying', 'testing'] as const
  const now = Date.now()
  let reaped = 0
  for (const status of inFlightStatuses) {
    const rows = await deps.storage.listTroubleshootReportsByStatus(status)
    for (const r of rows) {
      const lastSeen = r.updatedAt ?? r.createdAt ?? 0
      const ageMs = now - lastSeen
      if (ageMs < STALE_TROUBLESHOOT_MS) continue
      await deps.storage.patchTroubleshootReport({
        id: r.id,
        now,
        status: 'escalated',
        lastTestOutput: `stuck in '${status}' for ${Math.round(ageMs / 1000)}s — reaped`,
      })
      reaped++
    }
  }
  if (reaped > 0) {
    logger.warn(
      { reaped, staleThresholdMs: STALE_TROUBLESHOOT_MS },
      'troubleshoot: reap pass complete',
    )
  }
}

export function startAgentRunWorker(): void {
  if (interval) return
  stopped = false
  void reapOrphanedRuns().catch((err) => {
    logger.error({ err: (err as Error).message }, 'agent-run worker: reap failed')
  })
  void reapStuckTroubleshootReports().catch((err) => {
    logger.error({ err: (err as Error).message }, 'troubleshoot: reap failed')
  })
  interval = setInterval(() => {
    void tick()
    void reapStuckTroubleshootReports().catch(() => {
      /* logged inside */
    })
  }, POLL_INTERVAL_MS)
  logger.info(
    { pollMs: POLL_INTERVAL_MS, maxConcurrent: MAX_CONCURRENT },
    'agent-run worker started',
  )
}

export function stopAgentRunWorker(): void {
  stopped = true
  if (interval) {
    clearInterval(interval)
    interval = null
  }
  // Deliberately do NOT cancel in-flight runs here. The sidecar is restarted
  // routinely during development (Tauri's beforeDevCommand rebuilds it), and
  // cancelling on every shutdown was marking long-running agent runs (QA,
  // troubleshooter) as 'cancelled' mid-execution — the operator saw the step
  // silently revert to "Launch QA" with no result. We leave the rows as
  // 'running': if the child process truly died with the parent, the next
  // boot's reapOrphanedRuns() will close it as orphaned after STALE_RUN_MS;
  // if the restart was a no-op, the run keeps streaming. Explicit operator
  // cancellation still works via cancelInFlightRun().
  if (inFlight.size > 0) {
    logger.warn(
      { inFlight: inFlight.size },
      'agent-run worker stopping with runs still in flight — left as running, not cancelled',
    )
  }
}

export function cancelInFlightRun(runId: string): boolean {
  const runner = inFlight.get(runId)
  if (!runner) return false
  runner.cancel(runId)
  return true
}
