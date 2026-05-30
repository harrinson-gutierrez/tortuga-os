import { systemPromptFor } from '@tortuga-os/agent-runner'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'

export interface DesignerRunRequest {
  projectCode: string
  mode: 'import' | 'generate'
  /** Import: the Figma file key + node id to pull. */
  figmaFileKey?: string
  figmaNodeId?: string | null
  /** Generate: the operator's intent describing the product to design. */
  intent?: string
}

/**
 * Resolve the project-level design task, creating it on first use. Design
 * is a single deliverable for the whole project (one Figma), done before
 * architecture — so it hangs off a synthetic `<CODE>-000-DESIGN` story
 * (mirroring the `<CODE>-000` arch story idiom), NOT off a build story.
 * Idempotent: reuses the story/task if they already exist.
 */
type ResolveResult = { ok: true; taskId: string; projectId: string } | { ok: false; reason: string }

/** Human-readable text from a use-case error (no universal `.message`). */
function errText(e: {
  code: string
  message?: string
  reason?: string
  entity?: string
  id?: string
}): string {
  return e.message ?? e.reason ?? (e.entity ? `${e.entity} ${e.id ?? ''}`.trim() : e.code)
}

async function resolveProjectDesignTask(
  deps: CoreDeps,
  projectCode: string,
): Promise<ResolveResult> {
  const proj = await deps.storage.getProjectByCode(projectCode)
  if (!proj) return { ok: false, reason: `No existe el proyecto ${projectCode}.` }
  const projectId = proj.project.id

  const salesPhase = await deps.storage.getSalesPhase(projectId)
  if (!salesPhase) {
    return {
      ok: false,
      reason: 'El proyecto no tiene fase de ventas todavía. Crea el proyecto desde una cotización.',
    }
  }
  const quote = await deps.storage.getLatestQuoteForSalesPhase(salesPhase.id)
  if (!quote) {
    return {
      ok: false,
      reason:
        'El proyecto no tiene cotización aún. El diseño nace de la cotización: crea y guarda una cotización (con sus historias) antes de diseñar.',
    }
  }

  const storyCode = `${proj.project.code}-000-DESIGN`
  let story = await deps.storage.getStoryByCode(storyCode)
  if (!story) {
    const created = await useCases.stories.createStory(deps, {
      quoteId: quote.id,
      code: storyCode,
      title: 'Diseño del proyecto (Figma)',
      goal: 'Primera tarea del proyecto: producir el diseño visual completo en Figma —todas las pantallas— ANTES de arquitectura. Importas un Figma existente o lo generas desde la descripción del producto. Los frames quedan como la verdad visual contra la que se programa y se mide fidelidad pixel a pixel.',
      ownerRole: 'designer',
      // priority 0 keeps design strictly before the -000 architecture story
      // (which is priority 1); both share the -000 prefix so the code-asc
      // tiebreaker alone would otherwise put architecture first.
      estimatedHoursMin: 0,
      priority: 0,
      acceptanceCriteriaJson: JSON.stringify([
        'El diseño de todas las pantallas existe en Figma (importado o generado).',
        'Cada frame está asignado a su historia de build (auto por el repartidor o manual).',
        'El operador aprobó el diseño antes de pasar a arquitectura.',
      ]),
      inputsJson: '{}',
      outputsJson: '{}',
      verificationJson: '{}',
      outOfScopeJson: '[]',
    })
    if (!created.ok) {
      logger.warn({ projectCode, error: created.error }, 'design: failed to create T0-DESIGN story')
      return { ok: false, reason: `No se pudo crear la tarea de diseño: ${errText(created.error)}` }
    }
    story = await deps.storage.getStoryById(created.value.id)
    if (!story) return { ok: false, reason: 'No se pudo leer la historia de diseño recién creada.' }
  }

  const tasks = await deps.storage.listTasksForStory(story.id)
  const existing = tasks.find((t) => t.type === 'design')
  if (existing) return { ok: true, taskId: existing.id, projectId }
  const task = await useCases.tasks.createTask(deps, {
    storyId: story.id,
    code: `${storyCode}-T1`,
    type: 'design',
    ownerRole: 'designer',
    estimatedHoursMin: 0,
  })
  if (!task.ok)
    return { ok: false, reason: `No se pudo crear la tarea de diseño: ${errText(task.error)}` }
  return { ok: true, taskId: task.value.id, projectId }
}

function buildImportPrompt(args: { figmaFileKey: string; figmaNodeId: string | null }): string {
  const lines: string[] = [
    '# Mode: IMPORT the project design from an existing Figma file',
    '',
    `Figma fileKey: ${args.figmaFileKey}`,
    args.figmaNodeId
      ? `Figma nodeId: ${args.figmaNodeId}`
      : 'Figma nodeId: (whole file — import ALL top-level frames)',
    '',
    'Use the Figma MCP tools (get_metadata to enumerate frames,',
    'get_design_context, get_variable_defs, get_screenshot). Extract design',
    'tokens + a screenshot for EVERY screen/frame in scope, then emit the',
    'structured JSON described in your system prompt — one entry per frame.',
  ]
  return lines.join('\n')
}

/** Synthetic stories that are not build stories (design/arch placeholders). */
function isBuildStory(code: string): boolean {
  return !code.endsWith('-000') && !code.endsWith('-000-DESIGN')
}

interface StoryBrief {
  code: string
  title: string
  goal: string
}

/**
 * Load the project's build stories (title + goal) so GENERATE can design one
 * screen per story instead of relying on a hand-typed intent. The screens to
 * design ARE the stories the quote already defined.
 */
async function loadBuildStoriesForProject(
  deps: CoreDeps,
  projectId: string,
): Promise<StoryBrief[]> {
  const salesPhase = await deps.storage.getSalesPhase(projectId)
  if (!salesPhase) return []
  const quote = await deps.storage.getLatestQuoteForSalesPhase(salesPhase.id)
  if (!quote) return []
  const stories = await deps.storage.listStoriesForQuote(quote.id)
  return stories
    .filter((s) => isBuildStory(s.code))
    .map((s) => ({ code: s.code, title: s.title, goal: s.goal ?? '' }))
}

function buildGeneratePrompt(args: { intent: string; stories: StoryBrief[] }): string {
  const lines: string[] = ['# Mode: GENERATE the project design from the project stories', '']

  if (args.stories.length > 0) {
    lines.push('## Screens to design (one Figma frame per story)')
    lines.push(
      'These are the build stories the quote already defined. Design ONE screen',
      'for EACH story, named after the story so the frame-assigner can match it back:',
      '',
    )
    for (const s of args.stories) {
      lines.push(`- [${s.code}] ${s.title}${s.goal ? ` — ${s.goal}` : ''}`)
    }
    lines.push('')
  }

  const intent = args.intent.trim()
  if (intent) {
    lines.push('## Extra context from the operator', intent, '')
  }

  if (args.stories.length === 0 && !intent) {
    lines.push(
      'No stories or intent were provided. Design a sensible default screen set',
      'for the product and name each frame clearly.',
      '',
    )
  }

  lines.push(
    'Design every screen in Figma with generate_figma_design / use_figma anchored',
    'to the Tuurt design system (brand accent #f44e5c, tokens from the brandbook).',
    'Then get_screenshot + get_variable_defs on each generated frame and emit the',
    'structured JSON — one entry per frame.',
  )
  return lines.join('\n')
}

export type QueueDesignerResult = { ok: true; runId: string } | { ok: false; reason: string }

/**
 * Queue a project-level `designer` run on the T0-DESIGN task. Returns the
 * runId, or a human-readable reason when the project/quote can't be
 * resolved or the run can't be queued (surfaced to the operator in the UI).
 */
export async function queueDesignerRun(
  deps: CoreDeps,
  req: DesignerRunRequest,
): Promise<QueueDesignerResult> {
  const resolved = await resolveProjectDesignTask(deps, req.projectCode)
  if (!resolved.ok) {
    logger.warn(
      { projectCode: req.projectCode, reason: resolved.reason },
      'design: could not resolve project design task',
    )
    return { ok: false, reason: resolved.reason }
  }
  const userPrompt =
    req.mode === 'import'
      ? buildImportPrompt({
          figmaFileKey: req.figmaFileKey ?? '',
          figmaNodeId: req.figmaNodeId ?? null,
        })
      : buildGeneratePrompt({
          intent: req.intent ?? '',
          stories: await loadBuildStoriesForProject(deps, resolved.projectId),
        })

  const queued = await useCases.agentRuns.queueAgentRun(deps, {
    taskId: resolved.taskId,
    agentKind: 'designer',
    provider: 'claude-cli',
    systemPrompt: systemPromptFor('designer'),
    userPrompt,
  })
  if (!queued.ok) {
    logger.warn(
      { projectCode: req.projectCode, error: queued.error },
      'design: failed to queue run',
    )
    return { ok: false, reason: `No se pudo encolar el run: ${errText(queued.error)}` }
  }
  return { ok: true, runId: queued.value.id }
}
