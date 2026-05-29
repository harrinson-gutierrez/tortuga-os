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
    const runId = await queueDesignerRun(coreDeps(), {
      storyId: body.storyId,
      mode: 'import',
      figmaFileKey: target.fileKey,
      figmaNodeId: target.nodeId,
    })
    if (!runId) {
      return c.json({ error: `could not queue designer run for story ${body.storyId}` }, 422)
    }
    logger.info({ storyId: body.storyId, runId, fileKey: target.fileKey }, 'design: import queued')
    return c.json({ runId, storyId: body.storyId }, 201)
  })
  .post('/generate', async (c): Promise<Response> => {
    const body = GenerateDesignInput.parse(await c.req.json())
    const runId = await queueDesignerRun(coreDeps(), {
      storyId: body.storyId,
      mode: 'generate',
      intent: body.intent,
    })
    if (!runId) {
      return c.json({ error: `could not queue designer run for story ${body.storyId}` }, 422)
    }
    logger.info({ storyId: body.storyId, runId }, 'design: generate queued')
    return c.json({ runId, storyId: body.storyId }, 201)
  })
  .post('/:frameId/approve', async (c): Promise<Response> => {
    const frameId = c.req.param('frameId')
    const result = await useCases.designFrames.patchDesignFrame(coreDeps(), frameId, {
      status: 'approved',
    })
    return c.json(unwrap(result) satisfies DesignFrameDTO)
  })
