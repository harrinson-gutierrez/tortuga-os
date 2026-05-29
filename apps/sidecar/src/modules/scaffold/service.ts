import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { coreDeps } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'
import { type Manifest, loadManifest, readTemplate } from './manifest'

export interface ScaffoldPreview {
  stack: string
  displayName: string
  description: string
  workspace: string
  steps: Array<{ id: string; label: string; cmd: string }>
  files: Array<{ to: string }>
  verify: Array<{ id: string; label: string; cmd: string }>
}

export interface ScaffoldRunEvent {
  type: 'step-start' | 'step-stdout' | 'step-stderr' | 'step-end' | 'file' | 'done' | 'error'
  stepId?: string
  label?: string
  text?: string
  exitCode?: number
  to?: string
  message?: string
}

export interface PersistedScaffoldStep {
  id: string
  label: string
  status: 'pending' | 'running' | 'done' | 'failed'
  log: string
  exitCode: number | null
}

export interface PersistedScaffoldRun {
  id: string
  stack: string
  startedAt: number
  finishedAt: number | null
  steps: PersistedScaffoldStep[]
  createdFiles: string[]
  outcome: 'succeeded' | 'failed'
  error: string | null
}

export interface PersistedScaffoldHistory {
  version: 1
  runs: PersistedScaffoldRun[]
}

const HISTORY_REL_PATH = join('05-build', '.tortuga', 'scaffold-history.json')
const MAX_HISTORY_RUNS = 20
const MAX_LOG_PER_STEP = 8000

function historyPathFor(workspace: string): string {
  return join(workspace, HISTORY_REL_PATH)
}

export function readScaffoldHistory(workspace: string): PersistedScaffoldHistory {
  const p = historyPathFor(workspace)
  if (!existsSync(p)) return { version: 1, runs: [] }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as PersistedScaffoldHistory
    if (parsed.version !== 1 || !Array.isArray(parsed.runs)) {
      return { version: 1, runs: [] }
    }
    return parsed
  } catch (err) {
    logger.warn({ err: (err as Error).message, p }, 'scaffold-history: read failed, returning empty')
    return { version: 1, runs: [] }
  }
}

function appendScaffoldRun(workspace: string, run: PersistedScaffoldRun): void {
  const p = historyPathFor(workspace)
  mkdirSync(dirname(p), { recursive: true })
  const history = readScaffoldHistory(workspace)
  history.runs.push(run)
  if (history.runs.length > MAX_HISTORY_RUNS) {
    history.runs = history.runs.slice(-MAX_HISTORY_RUNS)
  }
  try {
    writeFileSync(p, JSON.stringify(history, null, 2), 'utf-8')
  } catch (err) {
    logger.warn({ err: (err as Error).message, p }, 'scaffold-history: write failed')
  }
}

function buildRecorder(stack: string): {
  recorder: (ev: ScaffoldRunEvent) => void
  snapshot: () => PersistedScaffoldRun
} {
  const startedAt = Date.now()
  const id = `run-${randomUUID()}`
  const steps = new Map<string, PersistedScaffoldStep>()
  const createdFiles: string[] = []
  let outcome: 'succeeded' | 'failed' = 'succeeded'
  let error: string | null = null

  const upsert = (sid: string, patch: Partial<PersistedScaffoldStep>): void => {
    const prev = steps.get(sid) ?? {
      id: sid,
      label: sid,
      status: 'pending' as const,
      log: '',
      exitCode: null,
    }
    steps.set(sid, { ...prev, ...patch })
  }

  const recorder = (ev: ScaffoldRunEvent): void => {
    if (ev.type === 'step-start' && ev.stepId) {
      upsert(ev.stepId, { label: ev.label ?? ev.stepId, status: 'running' })
    } else if ((ev.type === 'step-stdout' || ev.type === 'step-stderr') && ev.stepId && ev.text) {
      const prev = steps.get(ev.stepId) ?? {
        id: ev.stepId,
        label: ev.stepId,
        status: 'running' as const,
        log: '',
        exitCode: null,
      }
      const next = (prev.log + ev.text).slice(-MAX_LOG_PER_STEP)
      steps.set(ev.stepId, { ...prev, log: next })
    } else if (ev.type === 'step-end' && ev.stepId) {
      const exit = ev.exitCode ?? -1
      upsert(ev.stepId, { status: exit === 0 ? 'done' : 'failed', exitCode: exit })
      if (exit !== 0) outcome = 'failed'
    } else if (ev.type === 'file' && ev.to) {
      createdFiles.push(ev.to)
    } else if (ev.type === 'error') {
      outcome = 'failed'
      error = ev.message ?? 'unknown error'
    }
  }

  const snapshot = (): PersistedScaffoldRun => ({
    id,
    stack,
    startedAt,
    finishedAt: Date.now(),
    steps: Array.from(steps.values()),
    createdFiles,
    outcome,
    error,
  })

  return { recorder, snapshot }
}

function projectSlugFromCode(code: string): string {
  return (
    code
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '') || 'app'
  )
}

function projectClassName(code: string): string {
  const slug = projectSlugFromCode(code)
  return slug
    .split('_')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('')
}

interface TemplateVars {
  projectCode: string
  projectName: string
  projectSlug: string
  projectClassName: string
}

function applyVars(text: string, vars: TemplateVars): string {
  return text
    .replace(/\{\{projectCode\}\}/g, vars.projectCode)
    .replace(/\{\{projectName\}\}/g, vars.projectName)
    .replace(/\{\{projectSlug\}\}/g, vars.projectSlug)
    .replace(/\{\{projectClassName\}\}/g, vars.projectClassName)
}

async function loadProjectAndWorkspace(projectCode: string): Promise<{
  workspace: string
  vars: TemplateVars
  projectId: string
}> {
  const deps = coreDeps()
  const found = await deps.storage.getProjectByCode(projectCode)
  if (!found) throw new Error(`project ${projectCode} not found`)
  const { project } = found
  const workspace = project.workspacePath ?? workspacePathFor(project.code)
  return {
    workspace,
    projectId: project.id,
    vars: {
      projectCode: project.code,
      projectName: project.name,
      projectSlug: projectSlugFromCode(project.code),
      projectClassName: projectClassName(project.code),
    },
  }
}

export async function previewScaffold(
  projectCode: string,
  stack: string,
): Promise<ScaffoldPreview> {
  const m: Manifest = loadManifest(stack)
  const { workspace, vars } = await loadProjectAndWorkspace(projectCode)
  return {
    stack: m.stack,
    displayName: m.displayName,
    description: m.description,
    workspace,
    steps: m.steps.map((s) => ({
      id: s.id,
      label: s.label,
      cmd: `${s.command} ${s.args.map((a) => applyVars(a, vars)).join(' ')}`,
    })),
    files: m.files.map((f) => ({ to: f.to })),
    verify: m.verify.map((v) => ({
      id: v.id,
      label: v.label,
      cmd: `${v.command} ${v.args.map((a) => applyVars(a, vars)).join(' ')}`,
    })),
  }
}

export async function runScaffold(
  projectCode: string,
  stack: string,
  onEvent: (ev: ScaffoldRunEvent) => void,
): Promise<void> {
  let doneEmitted = false
  const { recorder, snapshot } = buildRecorder(stack)
  const safeEmit = (ev: ScaffoldRunEvent) => {
    try {
      onEvent(ev)
      recorder(ev)
      if (ev.type === 'done') doneEmitted = true
    } catch (e) {
      logger.warn({ err: (e as Error).message, ev: ev.type }, 'safeEmit swallowed error')
    }
  }
  let resolvedWorkspace: string | null = null
  try {
    const m: Manifest = loadManifest(stack)
    const { workspace, vars, projectId } = await loadProjectAndWorkspace(projectCode)
    resolvedWorkspace = workspace
    mkdirSync(workspace, { recursive: true })

    const deps = coreDeps()
    await deps.storage.patchProject(
      projectId,
      { stack: stack as never, workspacePath: workspace },
      deps.now(),
    )

    await runScaffoldBody(m, stack, workspace, vars, safeEmit)
  } catch (e) {
    logger.error({ err: (e as Error).message }, 'runScaffold threw')
    safeEmit({ type: 'error', message: (e as Error).message })
  } finally {
    if (!doneEmitted) {
      logger.info({ projectCode }, 'runScaffold finally — emitting done')
      safeEmit({ type: 'done' })
    }
    if (resolvedWorkspace) {
      try {
        appendScaffoldRun(resolvedWorkspace, snapshot())
        logger.info({ projectCode }, 'scaffold history persisted')
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'scaffold history persist failed')
      }
    }
  }
}

async function runScaffoldBody(
  m: Manifest,
  stack: string,
  workspace: string,
  vars: TemplateVars,
  onEvent: (ev: ScaffoldRunEvent) => void,
): Promise<void> {
  // 2) Run scaffold commands.
  for (const step of m.steps) {
    onEvent({ type: 'step-start', stepId: step.id, label: step.label })
    const cwd = join(workspace, step.cwd)
    const args = step.args.map((a) => applyVars(a, vars))
    logger.info({ stack, stepId: step.id, cmd: step.command, args, cwd }, 'scaffold step start')
    const exit = await runOne(step.command, args, cwd, (chunk, isStderr) => {
      onEvent({
        type: isStderr ? 'step-stderr' : 'step-stdout',
        stepId: step.id,
        text: chunk,
      })
    })
    logger.info({ stepId: step.id, exit }, 'scaffold step end (about to emit)')
    try {
      onEvent({ type: 'step-end', stepId: step.id, exitCode: exit })
      logger.info({ stepId: step.id }, 'scaffold step-end event emitted OK')
    } catch (e) {
      logger.error({ stepId: step.id, err: (e as Error).message }, 'onEvent step-end THREW')
      throw e
    }
    if (exit !== 0) {
      logger.warn({ stepId: step.id, exit }, 'scaffold step failed — emitting error and aborting')
      try {
        onEvent({
          type: 'error',
          stepId: step.id,
          message: `Step ${step.id} exited with code ${exit}. Aborting scaffold.`,
        })
      } catch (e) {
        logger.error({ err: (e as Error).message }, 'onEvent error THREW')
      }
      return
    }
  }

  // 3) Write template files (substituting vars).
  for (const f of m.files) {
    const tplContent = readTemplate(stack, f.fromTemplate)
    const rendered = applyVars(tplContent, vars)
    const absTo = join(workspace, f.to)
    mkdirSync(dirname(absTo), { recursive: true })
    // Don't overwrite if the file already exists with non-trivial content,
    // unless it's clearly a template marker (e.g. the auto-generated
    // lib/main.dart that flutter create produces — those we override).
    const shouldOverwrite =
      !existsSync(absTo) ||
      f.to.endsWith('main.dart') ||
      f.to.endsWith('ARCHITECTURE.md') ||
      f.to.endsWith('widget_test.dart')
    if (shouldOverwrite) {
      writeFileSync(absTo, rendered, 'utf-8')
      onEvent({ type: 'file', to: f.to })
    }
  }

  // 4) Run verification steps (analyze, typecheck).
  for (const v of m.verify) {
    onEvent({ type: 'step-start', stepId: v.id, label: v.label })
    const cwd = join(workspace, v.cwd)
    const args = v.args.map((a) => applyVars(a, vars))
    logger.info({ stepId: v.id, cmd: v.command, args, cwd }, 'scaffold verify start')
    const exit = await runOne(v.command, args, cwd, (chunk, isStderr) => {
      onEvent({
        type: isStderr ? 'step-stderr' : 'step-stdout',
        stepId: v.id,
        text: chunk,
      })
    })
    logger.info({ stepId: v.id, exit }, 'scaffold verify end')
    onEvent({ type: 'step-end', stepId: v.id, exitCode: exit })
  }

  logger.info({ workspace }, 'scaffold body finished verify loop — about to emit done')
  onEvent({ type: 'done' })
}

function runOne(
  command: string,
  args: string[],
  cwd: string,
  onChunk: (text: string, isStderr: boolean) => void,
): Promise<number> {
  // On Windows, most of these (flutter, npm, pnpm) are .cmd shims so we
  // need shell:true. The output buffering issue we hit with stream-json
  // doesn't apply here — these commands print plain text, not events
  // that need to drive UI in real time.
  const child = spawn(command, args, {
    cwd,
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  child.stdout.on('data', (b: Buffer) => onChunk(b.toString('utf-8'), false))
  child.stderr.on('data', (b: Buffer) => onChunk(b.toString('utf-8'), true))
  return new Promise<number>((resolve) => {
    const TIMEOUT_MS = 5 * 60_000
    const killer = setTimeout(() => {
      onChunk(`\n[scaffold] step timed out after ${TIMEOUT_MS / 1000}s — killing process tree\n`, true)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }, TIMEOUT_MS)
    killer.unref()
    let settled = false
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      logger.info({ command, code, signal }, 'runOne child close')
      resolve(code ?? -1)
    })
    child.on('exit', (code, signal) => {
      logger.info({ command, code, signal }, 'runOne child exit')
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(killer)
      logger.error({ command, err: err.message }, 'runOne child error')
      resolve(-1)
    })
  })
}
