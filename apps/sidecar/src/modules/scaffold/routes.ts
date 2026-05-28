import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { validateBody } from '../../shared/validate'
import { previewScaffold, runScaffold } from './service'

const PreviewBody = z.object({
  projectCode: z.string().min(1).max(64),
  stack: z.string().min(1).max(64),
})

const RunBody = z.object({
  projectCode: z.string().min(1).max(64),
  stack: z.string().min(1).max(64),
})

export const scaffoldRouter = new Hono()
  // List available templates so the UI can present them.
  .get('/templates', (c) => {
    return c.json({
      templates: [
        {
          stack: 'flutter-supabase',
          displayName: 'Flutter + Supabase',
          description:
            'App Flutter (Android + Web) con Supabase Auth + Postgres + RLS, Riverpod + go_router, Material 3.',
        },
      ],
    })
  })

  // Show what `run` would do without executing anything.
  .post('/preview', async (c) => {
    const v = await validateBody(c, PreviewBody)
    if (!v.success) return v.response
    try {
      const result = await previewScaffold(v.data.projectCode, v.data.stack)
      return c.json(result)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 400)
    }
  })

  // Stream the scaffold execution as SSE so the UI can show progress.
  .post('/run', async (c) => {
    const v = await validateBody(c, RunBody)
    if (!v.success) return v.response
    const { projectCode, stack } = v.data
    return streamSSE(c, async (stream) => {
      try {
        await runScaffold(projectCode, stack, async (ev) => {
          await stream.writeSSE({ data: JSON.stringify(ev) })
        })
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: (err as Error).message }),
        })
      }
    })
  })
