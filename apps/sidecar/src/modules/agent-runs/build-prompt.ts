import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { coreDeps } from '../../shared/core-deps'
import { workspacePathFor } from '../workspace/use-cases'

/** Read the project's ARCHITECTURE.md (via the story's project), or null. */
async function readArchitectureForStory(storyId: string): Promise<string | null> {
  const deps = coreDeps()
  try {
    const story = await deps.storage.getStoryById(storyId)
    if (!story) return null
    const quote = await deps.storage.getQuoteById(story.quoteId)
    if (!quote) return null
    const phase = await deps.storage.getPhaseById(quote.phaseId)
    if (!phase) return null
    const project = await deps.storage.getProjectById(phase.projectId)
    if (!project) return null
    const workspace = project.workspacePath ?? workspacePathFor(project.code)
    const archPath = join(workspace, 'ARCHITECTURE.md')
    if (!existsSync(archPath)) return null
    return readFileSync(archPath, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Assembles the user-facing prompt for an agent: task code, story code, goal,
 * acceptance criteria, ARCHITECTURE.md, the assigned Figma frame's design
 * tokens + baseline, and any extra prompt the operator typed. Shared by the
 * one-shot agent-run route and the coworker turn loop.
 */
export async function buildUserPrompt(
  taskId: string,
  extraPrompt: string | undefined,
): Promise<string> {
  const deps = coreDeps()
  const task = await deps.storage.getTaskById(taskId)
  if (!task) throw new Error(`task ${taskId} not found`)
  const story = await deps.storage.getStoryById(task.storyId)
  const lines: string[] = []
  lines.push('# Tortuga OS task brief')
  lines.push('')
  lines.push(`Task: **${task.code}** (type: ${task.type}, owner: ${task.ownerRole})`)
  if (story) {
    lines.push(`Story: **${story.code}** — ${story.title}`)
    lines.push(`Goal: ${story.goal}`)
    if (story.acceptanceCriteriaJson && story.acceptanceCriteriaJson !== '[]') {
      lines.push('')
      lines.push('## Acceptance criteria (JSON)')
      lines.push('```json')
      lines.push(story.acceptanceCriteriaJson)
      lines.push('```')
    }
    // For the arch/tech_lead T0 task we also dump the list of pending
    // features (stored in inputsJson as `pendingStories`) so the agent
    // knows what the project as a whole is about.
    if (
      (task.type === 'arch' || task.ownerRole === 'tech_lead') &&
      story.inputsJson &&
      story.inputsJson !== '{}'
    ) {
      lines.push('')
      lines.push('## Features de la cotización (informativo)')
      try {
        const inputs = JSON.parse(story.inputsJson) as { pendingStories?: string }
        if (inputs.pendingStories) lines.push(inputs.pendingStories)
      } catch {
        /* ignore */
      }
    }
  }

  // Inject ARCHITECTURE.md into the brief for implementation tasks so the
  // dev agent inherits the architecture decisions made by the arch T0.
  if (task.type !== 'arch' && task.ownerRole !== 'tech_lead' && story) {
    const archContent = await readArchitectureForStory(story.id)
    if (archContent) {
      lines.push('')
      lines.push('## ARCHITECTURE.md (fuente de verdad — síguelo)')
      lines.push(archContent)
    }

    // Inject the design spec of the Figma frame assigned to this story so
    // the dev implements pixel-faithful (the G5 gate diffs against the same
    // baseline). Tokens carry colors/typography/shadows/gradients/etc.
    const frames = await deps.storage.listDesignFramesForStory(story.id)
    const frame = frames.find((f) => f.baselineScreenshotPath) ?? frames[0]
    if (frame) {
      lines.push('')
      lines.push('## Diseño Figma de esta story (implementa pixel-perfect)')
      lines.push(`Frame: ${frame.name} (Figma node ${frame.figmaNodeId})`)
      lines.push('Tokens (colores, tipografía, sombras, gradientes, bordes, layout):')
      lines.push('```json')
      lines.push(frame.tokensJson)
      lines.push('```')
      if (frame.baselineScreenshotPath) {
        lines.push(
          `Baseline screenshot: ${frame.baselineScreenshotPath} (el gate G5 compara contra esto).`,
        )
      }
    }
  }

  lines.push('')
  lines.push(`Iteration: n=${task.currentIteration}`)
  if (extraPrompt?.trim()) {
    lines.push('')
    lines.push('## Operator instructions')
    lines.push(extraPrompt.trim())
  }
  return lines.join('\n')
}
