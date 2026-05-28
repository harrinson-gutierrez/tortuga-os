import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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
  const m: Manifest = loadManifest(stack)
  const { workspace, vars, projectId } = await loadProjectAndWorkspace(projectCode)
  mkdirSync(workspace, { recursive: true })

  // 1) Persist the chosen stack on the project so the rest of the app
  // (dev agent selector, gates) knows what to do.
  const deps = coreDeps()
  await deps.storage.patchProject(
    projectId,
    { stack: stack as never, workspacePath: workspace },
    deps.now(),
  )

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
    onEvent({ type: 'step-end', stepId: step.id, exitCode: exit })
    if (exit !== 0) {
      onEvent({
        type: 'error',
        stepId: step.id,
        message: `Step ${step.id} exited with code ${exit}. Aborting scaffold.`,
      })
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
      !existsSync(absTo) || f.to.endsWith('main.dart') || f.to.endsWith('ARCHITECTURE.md')
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
    const exit = await runOne(v.command, args, cwd, (chunk, isStderr) => {
      onEvent({
        type: isStderr ? 'step-stderr' : 'step-stdout',
        stepId: v.id,
        text: chunk,
      })
    })
    onEvent({ type: 'step-end', stepId: v.id, exitCode: exit })
  }

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
    child.on('close', (code) => resolve(code ?? -1))
    child.on('error', () => resolve(-1))
  })
}
