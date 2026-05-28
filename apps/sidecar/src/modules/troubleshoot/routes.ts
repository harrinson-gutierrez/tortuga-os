import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ConfirmTroubleshootInput,
  CreateBugfixInput,
  type CreateBugfixOutput,
  CreateTroubleshootInput,
  MarkActionDoneInput,
  type TroubleshootReportDTO,
} from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import { Hono } from 'hono'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'
import { applyDiagnosisFiles } from './applier'
import { queueDiagnosisRun } from './diagnosis-queue'

/**
 * Decode a base64 PNG into a fresh file inside
 * `<workspace>/05-build/_troubleshoots/<reportId>/<kind>.png` and return
 * the workspace-relative path. Returns null when input is missing.
 */
function persistScreenshotBase64(
  workspace: string,
  reportId: string,
  kind: 'before' | 'after',
  base64: string | undefined,
): string | null {
  if (!base64) return null
  const cleaned = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')
  let buffer: Buffer
  try {
    buffer = Buffer.from(cleaned, 'base64')
  } catch {
    return null
  }
  if (buffer.byteLength === 0) return null
  const dir = join(workspace, '05-build', '_troubleshoots', reportId)
  mkdirSync(dir, { recursive: true })
  const filename = `${kind}.png`
  writeFileSync(join(dir, filename), buffer)
  return `05-build/_troubleshoots/${reportId}/${filename}`
}

async function resolveWorkspaceForTask(taskId: string): Promise<string | null> {
  const deps = coreDeps()
  const task = await deps.storage.getTaskById(taskId)
  if (!task) return null
  return resolveWorkspaceForStory(task.storyId)
}

async function resolveWorkspaceForStory(storyId: string): Promise<string | null> {
  const deps = coreDeps()
  const story = await deps.storage.getStoryById(storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) return null
  return project.workspacePath ?? workspacePathFor(project.code)
}

export const troubleshootRouter = new Hono()
  .get('/by-task/:taskId', async (c): Promise<Response> => {
    const taskId = c.req.param('taskId')
    const result = await useCases.troubleshoot.listTroubleshootReportsForTask(coreDeps(), taskId)
    return c.json(unwrap(result) satisfies TroubleshootReportDTO[])
  })
  .get('/:id', async (c): Promise<Response> => {
    const id = c.req.param('id')
    const result = await useCases.troubleshoot.getTroubleshootReport(coreDeps(), id)
    return c.json(unwrap(result) satisfies TroubleshootReportDTO)
  })
  .post('/bugfix', async (c): Promise<Response> => {
    const body = CreateBugfixInput.parse(await c.req.json())
    const workspace = await resolveWorkspaceForStory(body.storyId)
    if (!workspace) {
      return c.json({ error: `could not resolve workspace for story ${body.storyId}` }, 400)
    }
    // 1. Create the bugfix task + initial troubleshoot report atomically.
    const created = await useCases.troubleshoot.createBugfixForStory(coreDeps(), {
      storyId: body.storyId,
      errorText: body.errorText,
      ...(body.contextNote ? { contextNote: body.contextNote } : {}),
    })
    if (!created.ok) {
      return c.json({ error: created.error }, 422)
    }
    const { taskId, reportId } = created.value

    // 2. Persist the optional screenshot to disk under the report folder.
    // The path is NOT yet persisted on the report row (the patch shape
    // doesn't accept beforeScreenshotPath today). Will be linked in 7.2.
    if (body.beforeScreenshotPngBase64) {
      const path = persistScreenshotBase64(
        workspace,
        reportId,
        'before',
        body.beforeScreenshotPngBase64,
      )
      logger.info({ reportId, path }, 'troubleshoot bugfix: screenshot persisted to disk')
    }

    // 3. Mark diagnosing and queue the troubleshooter agent run on the new task.
    await useCases.troubleshoot.markDiagnosing(coreDeps(), reportId)
    const runId = await queueDiagnosisRun(coreDeps(), reportId)
    logger.info(
      { reportId, taskId, runId, storyId: body.storyId },
      'troubleshoot: bugfix task + report created and queued',
    )
    return c.json({ taskId, reportId } satisfies CreateBugfixOutput, 201)
  })
  .post('/', async (c): Promise<Response> => {
    const body = CreateTroubleshootInput.parse(await c.req.json())
    const workspace = await resolveWorkspaceForTask(body.taskId)
    if (!workspace) {
      return c.json({ error: `could not resolve workspace for task ${body.taskId}` }, 400)
    }
    const tmpId = crypto.randomUUID()
    const screenshotPath = persistScreenshotBase64(
      workspace,
      tmpId,
      'before',
      body.beforeScreenshotPngBase64,
    )
    const created = await useCases.troubleshoot.createTroubleshootReport(coreDeps(), {
      ...body,
      beforeScreenshotPath: screenshotPath,
    })
    if (!created.ok) {
      return c.json({ error: created.error }, 422)
    }
    // Move screenshot to its final directory if the temporary id differs.
    if (screenshotPath && existsSync(join(workspace, screenshotPath))) {
      const finalDir = join(workspace, '05-build', '_troubleshoots', created.value.id)
      mkdirSync(finalDir, { recursive: true })
      try {
        const buf = Buffer.from(
          (body.beforeScreenshotPngBase64 ?? '').replace(/^data:image\/(png|jpeg|jpg);base64,/, ''),
          'base64',
        )
        writeFileSync(join(finalDir, 'before.png'), buf)
      } catch (err) {
        logger.warn({ err: (err as Error).message }, 'troubleshoot: failed to relocate screenshot')
      }
    }
    // Mark diagnosing and queue the agent.
    await useCases.troubleshoot.markDiagnosing(coreDeps(), created.value.id)
    const runId = await queueDiagnosisRun(coreDeps(), created.value.id)
    logger.info(
      { reportId: created.value.id, runId, taskId: body.taskId },
      'troubleshoot: created and queued diagnosis',
    )
    return c.json(created.value satisfies TroubleshootReportDTO, 201)
  })
  .post('/:id/rediagnose', async (c): Promise<Response> => {
    const id = c.req.param('id')
    const marked = await useCases.troubleshoot.markDiagnosing(coreDeps(), id)
    if (!marked.ok) return c.json({ error: marked.error }, 422)
    const runId = await queueDiagnosisRun(coreDeps(), id)
    return c.json({ reportId: id, runId, status: marked.value.status })
  })
  .post('/:id/apply', async (c): Promise<Response> => {
    const id = c.req.param('id')
    try {
      const outcome = await applyDiagnosisFiles(coreDeps(), id)
      const refreshed = await useCases.troubleshoot.getTroubleshootReport(coreDeps(), id)
      return c.json({
        outcome,
        report: refreshed.ok ? refreshed.value : null,
      })
    } catch (err) {
      // The applier crashed mid-pipeline (e.g. MCP spawn failed, flutter
      // not on PATH, fs error). Without this safety net the report stays
      // stuck in 'applying' forever. Flip it to 'escalated' with the
      // error in lastTestOutput so the operator can see what happened.
      const msg = (err as Error).message
      logger.error({ reportId: id, err: msg }, 'troubleshoot apply crashed — escalating report')
      try {
        await coreDeps().storage.patchTroubleshootReport({
          id,
          now: Date.now(),
          status: 'escalated',
          lastTestOutput: `apply crashed: ${msg}`,
        })
      } catch {
        /* if even the patch fails the reaper will catch it */
      }
      return c.json(
        {
          outcome: {
            reportId: id,
            status: 'invalid-state',
            filesWritten: [],
            reason: `apply crashed: ${msg}`,
          },
          report: null,
        },
        500,
      )
    }
  })
  .post('/:id/action-completed', async (c): Promise<Response> => {
    const id = c.req.param('id')
    const body = MarkActionDoneInput.parse(await c.req.json())
    const result = await useCases.troubleshoot.markOperatorActionDone(coreDeps(), id, body)
    return c.json(unwrap(result) satisfies TroubleshootReportDTO)
  })
  .post('/:id/confirm', async (c): Promise<Response> => {
    const id = c.req.param('id')
    const body = ConfirmTroubleshootInput.parse(await c.req.json())
    const workspace = (await useCases.troubleshoot.getTroubleshootReport(coreDeps(), id)).ok
      ? await resolveWorkspaceForTask(
          (
            (await useCases.troubleshoot.getTroubleshootReport(coreDeps(), id)) as {
              ok: true
              value: TroubleshootReportDTO
            }
          ).value.taskId,
        )
      : null
    const afterPath =
      workspace && body.afterScreenshotPngBase64
        ? persistScreenshotBase64(workspace, id, 'after', body.afterScreenshotPngBase64)
        : null
    const result = await useCases.troubleshoot.confirmTroubleshoot(coreDeps(), id, {
      ...body,
      afterScreenshotPath: afterPath,
    })
    return c.json(unwrap(result) satisfies TroubleshootReportDTO)
  })
  .post('/:id/dismiss', async (c): Promise<Response> => {
    const id = c.req.param('id')
    const result = await useCases.troubleshoot.dismissTroubleshoot(coreDeps(), id)
    return c.json(unwrap(result) satisfies TroubleshootReportDTO)
  })
