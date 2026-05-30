import { systemPromptFor } from '@tortuga-os/agent-runner'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'

export interface DesignerRunRequest {
  projectCode: string
  mode: 'import' | 'generate' | 'explore-style'
  /** Import: the Figma file key + node id to pull. */
  figmaFileKey?: string
  figmaNodeId?: string | null
  /** Generate / explore-style: the operator's intent / extra context. */
  intent?: string
}

/**
 * Resolve the projectId for a design run. Design is no longer a backlog task:
 * the designer runs at PROJECT level (project-scoped agent run), so we only
 * need the project to exist and have a quote (the quote's stories feed the
 * GENERATE prompt and gate the friendly "no quote yet" message).
 */
type ResolveResult = { ok: true; projectId: string } | { ok: false; reason: string }

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

async function resolveProjectForDesign(
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
  return { ok: true, projectId }
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

/**
 * Visual discovery: generate 2-3 distinct STYLE DIRECTIONS (one sample frame
 * each) so the operator can pick a look-and-feel before the real per-story
 * screens are designed. Each option is a full frame the post-hook persists
 * like any other; naming them "Style option N — …" keeps them identifiable in
 * the pool. Anchored to the Tuurt brand but free to vary palette/type/mood.
 */
function buildExploreStylePrompt(args: { intent: string; stories: StoryBrief[] }): string {
  const lines: string[] = [
    '# Mode: EXPLORE — propose visual style directions',
    '',
    'Generate exactly 2-3 DISTINCT style directions for this product, each as ONE',
    'sample Figma frame of a representative screen (e.g. the main dashboard or login).',
    'The goal is for the operator to PICK a direction, not to design every screen yet.',
    'Make the options genuinely different (palette, typography, density, mood).',
    'Name each frame "Style option 1 — <short label>", "Style option 2 — …", etc.',
    '',
  ]
  if (args.stories.length > 0) {
    lines.push('## Product context (the stories this design will serve)')
    for (const s of args.stories) {
      lines.push(`- [${s.code}] ${s.title}${s.goal ? ` — ${s.goal}` : ''}`)
    }
    lines.push('')
  }
  const intent = args.intent.trim()
  if (intent) lines.push('## Extra context from the operator', intent, '')
  lines.push(
    'Anchor to the Tuurt brand (accent #f44e5c, brandbook tokens) but you MAY vary',
    'the palette/type per option to give real choice. Create each option in Figma with',
    'generate_figma_design / use_figma, then get_screenshot + get_variable_defs and emit',
    'the structured JSON — one entry per style option.',
  )
  return lines.join('\n')
}

export type QueueDesignerResult = { ok: true; runId: string } | { ok: false; reason: string }

/**
 * Queue a PROJECT-scoped `designer` run (no backlog task). Returns the runId,
 * or a human-readable reason when the project/quote can't be resolved or the
 * run can't be queued (surfaced to the operator in the UI).
 */
export async function queueDesignerRun(
  deps: CoreDeps,
  req: DesignerRunRequest,
): Promise<QueueDesignerResult> {
  const resolved = await resolveProjectForDesign(deps, req.projectCode)
  if (!resolved.ok) {
    logger.warn(
      { projectCode: req.projectCode, reason: resolved.reason },
      'design: could not resolve project',
    )
    return { ok: false, reason: resolved.reason }
  }

  let userPrompt: string
  if (req.mode === 'import') {
    userPrompt = buildImportPrompt({
      figmaFileKey: req.figmaFileKey ?? '',
      figmaNodeId: req.figmaNodeId ?? null,
    })
  } else if (req.mode === 'explore-style') {
    userPrompt = buildExploreStylePrompt({
      intent: req.intent ?? '',
      stories: await loadBuildStoriesForProject(deps, resolved.projectId),
    })
  } else {
    userPrompt = buildGeneratePrompt({
      intent: req.intent ?? '',
      stories: await loadBuildStoriesForProject(deps, resolved.projectId),
    })
  }

  const queued = await useCases.agentRuns.queueProjectAgentRun(deps, {
    projectId: resolved.projectId,
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
