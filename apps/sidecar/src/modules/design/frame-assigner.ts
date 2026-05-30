import { systemPromptFor } from '@tortuga-os/agent-runner'
import { FrameAssignerOutput } from '@tortuga-os/contracts'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import type { HookResult } from './designer-output'

const FENCED_BLOCK = /```(?:json|JSON|jsonc)?\s*([\s\S]*?)```/g

/** Synthetic stories that are not build stories (design/arch placeholders). */
function isBuildStory(code: string): boolean {
  return !code.endsWith('-000') && !code.endsWith('-000-DESIGN')
}

/**
 * Resolve the project's pooled frames (storyId null) + build stories, build
 * the assigner prompt, and queue a `frame-assigner` run on the same design
 * task. No-ops (returns null) when there's nothing to assign.
 */
export async function queueFrameAssignerRun(
  deps: CoreDeps,
  projectId: string,
  designRunId: string,
): Promise<string | null> {
  const designRun = await deps.storage.getAgentRunById(designRunId)
  if (!designRun) return null

  const frames = await deps.storage.listDesignFramesForProject(projectId)
  const pool = frames.filter((f) => f.storyId === null)
  if (pool.length === 0) return null

  const project = await deps.storage.getProjectById(projectId)
  if (!project) return null
  const salesPhase = await deps.storage.getSalesPhase(projectId)
  if (!salesPhase) return null
  const quote = await deps.storage.getLatestQuoteForSalesPhase(salesPhase.id)
  if (!quote) return null
  const stories = (await deps.storage.listStoriesForQuote(quote.id)).filter((s) =>
    isBuildStory(s.code),
  )
  if (stories.length === 0) return null

  const userPrompt = [
    '# Assign pooled Figma frames to build stories',
    '',
    '## POOL (unassigned frames)',
    JSON.stringify(
      pool.map((f) => ({ frameId: f.id, name: f.name, nodeId: f.figmaNodeId })),
      null,
      2,
    ),
    '',
    '## STORIES (build stories)',
    JSON.stringify(
      stories.map((s) => ({ storyId: s.id, code: s.code, title: s.title, goal: s.goal })),
      null,
      2,
    ),
  ].join('\n')

  const queued = await useCases.agentRuns.queueAgentRun(deps, {
    taskId: designRun.taskId,
    agentKind: 'frame-assigner',
    provider: 'claude-cli',
    systemPrompt: systemPromptFor('frame-assigner'),
    userPrompt,
  })
  if (!queued.ok) {
    logger.warn({ projectId, error: queued.error }, 'design: failed to queue frame-assigner')
    return null
  }
  return queued.value.id
}

function parseAssignerOutput(
  output: string,
): { ok: true; value: FrameAssignerOutput } | { ok: false; reason: string } {
  const candidates: string[] = []
  for (const m of output.matchAll(FENCED_BLOCK)) {
    if (m[1]) candidates.push(m[1])
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = FrameAssignerOutput.safeParse(JSON.parse(candidates[i]!.trim()))
      if (parsed.success) return { ok: true, value: parsed.data }
    } catch {
      /* try previous block */
    }
  }
  return { ok: false, reason: 'no fenced JSON block matched FrameAssignerOutput' }
}

/**
 * Worker post-run hook for `frame-assigner` runs: apply each frame→story
 * assignment. Guards: only assigns frames that are still pooled (storyId
 * null) and that actually belong to a frame in the project.
 */
export async function handleFrameAssignerOutput(
  deps: CoreDeps,
  runId: string,
  output: string,
): Promise<HookResult> {
  const parsed = parseAssignerOutput(output)
  if (!parsed.ok) {
    logger.warn({ runId, reason: parsed.reason }, 'design: frame-assigner output parse failed')
    return {
      ok: false,
      reason: `no se pudo leer el reparto de frames del agente — ${parsed.reason}`,
      retryableParse: true,
    }
  }
  let applied = 0
  for (const a of parsed.value.assignments) {
    const frame = await deps.storage.getDesignFrameById(a.frameId)
    if (!frame || frame.storyId !== null) continue
    await deps.storage.patchDesignFrame({
      id: a.frameId,
      patch: { storyId: a.storyId },
      now: deps.now(),
    })
    applied++
  }
  logger.info({ runId, applied, total: parsed.value.assignments.length }, 'design: frames assigned')
  return {
    ok: true,
    detail: `${applied}/${parsed.value.assignments.length} frame(s) repartidos a historias`,
  }
}
