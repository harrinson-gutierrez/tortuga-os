import { systemPromptFor } from '@tortuga-os/agent-runner'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'

export interface DesignerRunRequest {
  storyId: string
  mode: 'import' | 'generate'
  /** Import: the Figma file key + node id to pull. */
  figmaFileKey?: string
  figmaNodeId?: string | null
  /** Generate: the operator's intent describing the screen to design. */
  intent?: string
}

/**
 * Resolve the `design` task for a story, creating one on first use. A
 * story has exactly one design task; the designer agent runs against it
 * so its output (and the resulting frames) hang off a real task/iteration.
 */
async function resolveDesignTask(deps: CoreDeps, storyId: string): Promise<string | null> {
  const story = await deps.storage.getStoryById(storyId)
  if (!story) return null
  const tasks = await deps.storage.listTasksForStory(storyId)
  const existing = tasks.find((t) => t.type === 'design')
  if (existing) return existing.id
  const created = await useCases.tasks.createTask(deps, {
    storyId,
    code: `${story.code}-DESIGN`,
    type: 'design',
    ownerRole: 'designer',
    estimatedHoursMin: 0,
  })
  return created.ok ? created.value.id : null
}

function buildImportPrompt(args: { figmaFileKey: string; figmaNodeId: string | null }): string {
  const lines: string[] = [
    '# Mode: IMPORT an existing Figma design',
    '',
    `Figma fileKey: ${args.figmaFileKey}`,
    args.figmaNodeId ? `Figma nodeId: ${args.figmaNodeId}` : 'Figma nodeId: (whole file)',
    '',
    'Use the Figma MCP tools (get_design_context, get_variable_defs,',
    'get_screenshot, get_metadata) on the node(s) above. Extract the design',
    'tokens (colors, typography, spacing, radii) and a screenshot of each',
    'frame, then emit the structured JSON described in your system prompt.',
  ]
  return lines.join('\n')
}

function buildGeneratePrompt(args: { intent: string }): string {
  const lines: string[] = [
    '# Mode: GENERATE a Figma design from intent',
    '',
    '## Intent',
    args.intent.trim(),
    '',
    'Use generate_figma_design / use_figma anchored to the Tuurt design',
    'system (brand accent #f44e5c, tokens from the brandbook). Create the',
    'frames in Figma, then emit the structured JSON described in your system',
    'prompt with the generated fileKey + node ids.',
  ]
  return lines.join('\n')
}

/**
 * Queue a `designer` agent run for the story's design task and link the
 * runId so the worker post-run hook can attribute the produced frames.
 * Returns the runId, or null when the story/task can't be resolved.
 */
export async function queueDesignerRun(
  deps: CoreDeps,
  req: DesignerRunRequest,
): Promise<string | null> {
  const taskId = await resolveDesignTask(deps, req.storyId)
  if (!taskId) {
    logger.warn({ storyId: req.storyId }, 'design: could not resolve design task')
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
    taskId,
    agentKind: 'designer',
    provider: 'claude-cli',
    systemPrompt: systemPromptFor('designer'),
    userPrompt,
  })
  if (!queued.ok) {
    logger.warn({ storyId: req.storyId, error: queued.error }, 'design: failed to queue run')
    return null
  }
  return queued.value.id
}
