import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoreDeps } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'
import { parseDesignerOutput } from './designer-parser'
import { queueFrameAssignerRun } from './frame-assigner'

interface DesignContext {
  workspace: string
  projectId: string
}

async function resolveContextForRun(deps: CoreDeps, runId: string): Promise<DesignContext | null> {
  const run = await deps.storage.getAgentRunById(runId)
  if (!run) return null
  const task = await deps.storage.getTaskById(run.taskId)
  if (!task) return null
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) return null
  return {
    workspace: project.workspacePath ?? workspacePathFor(project.code),
    projectId: project.id,
  }
}

/**
 * Decode a base64 PNG into `03-design/_frames/<frameId>/baseline.png` and
 * return the workspace-relative path. Best-effort: returns null on any
 * failure so a bad screenshot never aborts frame persistence.
 */
function persistBaselinePng(workspace: string, frameId: string, base64: string): string | null {
  try {
    const cleaned = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')
    const buffer = Buffer.from(cleaned, 'base64')
    if (buffer.byteLength === 0) return null
    const dir = join(workspace, '03-design', '_frames', frameId)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'baseline.png'), buffer)
    return `03-design/_frames/${frameId}/baseline.png`
  } catch (err) {
    logger.warn({ frameId, err: (err as Error).message }, 'design: failed to persist baseline png')
    return null
  }
}

/**
 * Worker post-run hook for `designer` runs. Parses the structured output,
 * persists one design_frame per emitted frame, and decodes each frame's
 * screenshot into the baseline PNG used by the G5 fidelity gate. Re-imports
 * of the same node update the existing frame in place (UNIQUE story+node).
 */
export async function handleDesignerOutput(
  deps: CoreDeps,
  runId: string,
  output: string,
): Promise<void> {
  const parsed = parseDesignerOutput(output)
  if (!parsed.ok) {
    logger.warn({ runId, reason: parsed.reason }, 'design: designer output parse failed')
    return
  }
  const ctx = await resolveContextForRun(deps, runId)
  if (!ctx) {
    logger.warn({ runId }, 'design: could not resolve project/workspace for designer run')
    return
  }
  const existing = await deps.storage.listDesignFramesForProject(ctx.projectId)
  const status = parsed.output.mode === 'generate' ? 'generated' : 'imported'

  for (const frame of parsed.output.frames) {
    const prior = existing.find((f) => f.figmaNodeId === frame.figmaNodeId)
    const frameId = prior?.id ?? deps.newId()
    const baselinePath = frame.screenshotBase64
      ? persistBaselinePng(ctx.workspace, frameId, frame.screenshotBase64)
      : (prior?.baselineScreenshotPath ?? null)

    if (prior) {
      await deps.storage.patchDesignFrame({
        id: prior.id,
        patch: {
          name: frame.name,
          tokensJson: JSON.stringify(frame.tokens),
          baselineScreenshotPath: baselinePath,
          status,
        },
        now: deps.now(),
      })
    } else {
      // New frames land in the project pool (storyId null); the
      // frame-assigner run distributes them to build stories next.
      await deps.storage.createDesignFrame({
        id: frameId,
        projectId: ctx.projectId,
        storyId: null,
        figmaFileKey: frame.figmaFileKey,
        figmaNodeId: frame.figmaNodeId,
        name: frame.name,
        tokensJson: JSON.stringify(frame.tokens),
        baselineScreenshotPath: baselinePath,
        status,
        fidelityPct: null,
        now: deps.now(),
      })
    }
  }
  logger.info(
    {
      runId,
      projectId: ctx.projectId,
      frames: parsed.output.frames.length,
      mode: parsed.output.mode,
    },
    'design: persisted designer output',
  )

  // Auto-distribute the freshly-imported frames to their build stories.
  await queueFrameAssignerRun(deps, ctx.projectId, runId)
}
