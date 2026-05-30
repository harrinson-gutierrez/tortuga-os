import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, normalize } from 'node:path'
import type { CoreDeps } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'
import { parseDesignerOutput } from './designer-parser'
import { queueFrameAssignerRun } from './frame-assigner'

interface DesignContext {
  workspace: string
  projectId: string
}

/**
 * Outcome of a post-run hook. `ok: false` carries a human-readable reason that
 * the worker persists onto the run so the operator sees WHY a Figma import
 * produced nothing, instead of a silent success. `retryableParse` flags the
 * "agent emitted the wrong format" case the worker can re-queue once with a
 * corrective prompt.
 */
export type HookResult =
  | { ok: true; detail: string }
  | { ok: false; reason: string; retryableParse?: boolean }

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
 * Copy the PNG the agent saved (at a workspace-relative `screenshotPath`) into
 * the canonical baseline `03-design/_frames/<frameId>/baseline.png` and return
 * its workspace-relative path. The agent curls each screenshot to disk, so we
 * only move a file here — no multi-MB base64 ever touches the run output.
 *
 * Returns null when the agent referenced a path that doesn't exist (frame
 * still persists, just without a baseline). Throws only on a real filesystem
 * error so the caller can surface it instead of silently producing a frame the
 * G5 gate can never compare against. The path is confined to the workspace to
 * reject traversal (`../`) the agent might emit.
 */
function persistBaselinePng(
  workspace: string,
  frameId: string,
  screenshotPath: string,
): string | null {
  const srcAbs = normalize(join(workspace, screenshotPath))
  if (!srcAbs.startsWith(normalize(workspace))) return null
  if (!existsSync(srcAbs)) return null
  const dir = join(workspace, '03-design', '_frames', frameId)
  mkdirSync(dir, { recursive: true })
  copyFileSync(srcAbs, join(dir, 'baseline.png'))
  return `03-design/_frames/${frameId}/baseline.png`
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
): Promise<HookResult> {
  const parsed = parseDesignerOutput(output)
  if (!parsed.ok) {
    logger.warn({ runId, reason: parsed.reason }, 'design: designer output parse failed')
    return {
      ok: false,
      reason: `no se pudo leer el diseño del agente — ${parsed.reason}`,
      retryableParse: true,
    }
  }
  const ctx = await resolveContextForRun(deps, runId)
  if (!ctx) {
    logger.warn({ runId }, 'design: could not resolve project/workspace for designer run')
    return {
      ok: false,
      reason:
        'no se pudo resolver el proyecto/workspace de este run (task→story→quote→phase→project)',
    }
  }
  if (parsed.output.frames.length === 0) {
    return {
      ok: false,
      reason:
        'el agente no devolvió ningún frame (¿el link de Figma apunta a un nodo vacío o el MCP no respondió?)',
      retryableParse: true,
    }
  }
  const existing = await deps.storage.listDesignFramesForProject(ctx.projectId)
  const status = parsed.output.mode === 'generate' ? 'generated' : 'imported'
  let baselineFailures = 0

  for (const frame of parsed.output.frames) {
    const prior = existing.find((f) => f.figmaNodeId === frame.figmaNodeId)
    const frameId = prior?.id ?? deps.newId()
    let baselinePath: string | null
    if (frame.screenshotPath) {
      try {
        baselinePath =
          persistBaselinePng(ctx.workspace, frameId, frame.screenshotPath) ??
          prior?.baselineScreenshotPath ??
          null
      } catch (err) {
        baselineFailures++
        logger.warn(
          { runId, frameId, err: (err as Error).message },
          'design: failed to persist baseline png',
        )
        baselinePath = prior?.baselineScreenshotPath ?? null
      }
    } else {
      baselinePath = prior?.baselineScreenshotPath ?? null
    }

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

  const frameCount = parsed.output.frames.length
  const base = `${frameCount} frame(s) ${status === 'generated' ? 'generados' : 'importados'}`
  return {
    ok: true,
    detail:
      baselineFailures > 0
        ? `${base} · ${baselineFailures} sin baseline PNG (revisar el gate G5)`
        : base,
  }
}
