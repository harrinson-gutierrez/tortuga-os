import { type DesignFrameDTO, GenerateDesignInput, ImportDesignInput } from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import { Hono } from 'hono'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { queueDesignerRun } from './designer-queue'
import { parseFigmaUrl } from './figma-url'

export const designRouter = new Hono()
  .post('/import', async (c): Promise<Response> => {
    const body = ImportDesignInput.parse(await c.req.json())
    const target = parseFigmaUrl(body.figmaUrl)
    if (!target) {
      return c.json({ error: `not a valid Figma URL: ${body.figmaUrl}` }, 400)
    }
    const queued = await queueDesignerRun(coreDeps(), {
      projectCode: body.projectCode,
      mode: 'import',
      figmaFileKey: target.fileKey,
      figmaNodeId: target.nodeId,
    })
    if (!queued.ok) {
      return c.json({ error: queued.reason }, 422)
    }
    logger.info(
      { projectCode: body.projectCode, runId: queued.runId, fileKey: target.fileKey },
      'design: import queued',
    )
    return c.json({ runId: queued.runId, projectCode: body.projectCode }, 201)
  })
  .post('/generate', async (c): Promise<Response> => {
    const body = GenerateDesignInput.parse(await c.req.json())
    const queued = await queueDesignerRun(coreDeps(), {
      projectCode: body.projectCode,
      mode: 'generate',
      intent: body.intent,
    })
    if (!queued.ok) {
      return c.json({ error: queued.reason }, 422)
    }
    logger.info({ projectCode: body.projectCode, runId: queued.runId }, 'design: generate queued')
    return c.json({ runId: queued.runId, projectCode: body.projectCode }, 201)
  })
  .post('/:frameId/approve', async (c): Promise<Response> => {
    const frameId = c.req.param('frameId')
    const result = await useCases.designFrames.patchDesignFrame(coreDeps(), frameId, {
      status: 'approved',
    })
    return c.json(unwrap(result) satisfies DesignFrameDTO)
  })
