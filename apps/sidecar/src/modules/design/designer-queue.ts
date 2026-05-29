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
async function resolveProjectDesignTask(
  deps: CoreDeps,
  projectCode: string,
): Promise<{ taskId: string; projectId: string } | null> {
  const proj = await deps.storage.getProjectByCode(projectCode)
  if (!proj) return null
  const projectId = proj.project.id

  const salesPhase = await deps.storage.getSalesPhase(projectId)
  if (!salesPhase) return null
  const quote = await deps.storage.getLatestQuoteForSalesPhase(salesPhase.id)
  if (!quote) return null

  const storyCode = `${proj.project.code}-000-DESIGN`
  let story = await deps.storage.getStoryByCode(storyCode)
  if (!story) {
    const created = await useCases.stories.createStory(deps, {
      quoteId: quote.id,
      code: storyCode,
      title: 'Diseño del proyecto',
      goal: 'Definir el diseño visual completo del proyecto en Figma (todas las pantallas) antes de arquitectura. Cada frame se reparte a su story de build.',
      ownerRole: 'designer',
      estimatedHoursMin: 0,
      priority: 1,
      acceptanceCriteriaJson: '[]',
      inputsJson: '{}',
      outputsJson: '{}',
      verificationJson: '{}',
      outOfScopeJson: '[]',
    })
    if (!created.ok) {
      logger.warn({ projectCode, error: created.error }, 'design: failed to create T0-DESIGN story')
      return null
    }
    story = await deps.storage.getStoryById(created.value.id)
    if (!story) return null
  }

  const tasks = await deps.storage.listTasksForStory(story.id)
  const existing = tasks.find((t) => t.type === 'design')
  if (existing) return { taskId: existing.id, projectId }
  const task = await useCases.tasks.createTask(deps, {
    storyId: story.id,
    code: `${storyCode}-T1`,
    type: 'design',
    ownerRole: 'designer',
    estimatedHoursMin: 0,
  })
  return task.ok ? { taskId: task.value.id, projectId } : null
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

function buildGeneratePrompt(args: { intent: string }): string {
  const lines: string[] = [
    '# Mode: GENERATE the project design from intent',
    '',
    '## Intent',
    args.intent.trim(),
    '',
    'Design the full set of screens in Figma with generate_figma_design /',
    'use_figma anchored to the Tuurt design system (brand accent #f44e5c,',
    'tokens from the brandbook). Then get_screenshot + get_variable_defs on',
    'each generated frame and emit the structured JSON — one entry per frame.',
  ]
  return lines.join('\n')
}

/**
 * Queue a project-level `designer` run on the T0-DESIGN task. Returns the
 * runId, or null when the project/quote can't be resolved.
 */
export async function queueDesignerRun(
  deps: CoreDeps,
  req: DesignerRunRequest,
): Promise<string | null> {
  const resolved = await resolveProjectDesignTask(deps, req.projectCode)
  if (!resolved) {
    logger.warn({ projectCode: req.projectCode }, 'design: could not resolve project design task')
    return null
  }
  const userPrompt =
    req.mode === 'import'
      ? buildImportPrompt({
          figmaFileKey: req.figmaFileKey ?? '',
          figmaNodeId: req.figmaNodeId ?? null,
        })
      : buildGeneratePrompt({ intent: req.intent ?? '' })

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
    return null
  }
  return queued.value.id
}
