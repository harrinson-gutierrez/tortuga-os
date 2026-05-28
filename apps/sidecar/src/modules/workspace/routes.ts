import { Hono } from 'hono'
import { ValidationError } from '../../shared/errors'
import * as uc from './use-cases'

export const workspaceRouter = new Hono()
  // File tree of a project workspace.
  .get('/:code', async (c) => {
    return c.json(await uc.getWorkspaceTree(c.req.param('code')))
  })

  // File content from a workspace; `?path=` is relative to the root.
  .get('/:code/file', async (c) => {
    const path = c.req.query('path')
    if (!path) throw new ValidationError('query param "path" is required')
    return c.json(await uc.readWorkspaceFile(c.req.param('code'), path))
  })

  // Raw bytes of a workspace file (images, PDFs, downloads). `?path=` relative
  // to the root; `?download=1` forces a download instead of inline preview.
  .get('/:code/raw', async (c) => {
    const path = c.req.query('path')
    if (!path) throw new ValidationError('query param "path" is required')
    const file = await uc.readWorkspaceFileRaw(c.req.param('code'), path)
    const disposition = c.req.query('download') ? 'attachment' : 'inline'
    // Return a standard Response with the raw bytes. Copy into a fresh
    // Uint8Array (ArrayBuffer-backed) so the body type is unambiguous.
    const bytes = Uint8Array.from(file.buffer)
    return new Response(bytes, {
      headers: {
        'Content-Type': file.mime,
        'Content-Length': String(file.sizeBytes),
        'Content-Disposition': `${disposition}; filename="${file.fileName}"`,
        'Cache-Control': 'no-cache',
      },
    })
  })

  // Re-create (idempotent) the workspace folder tree and associate it with the
  // project if it has no `workspacePath` yet.
  .post('/:code/ensure', async (c) => {
    const code = c.req.param('code')
    const root = await uc.ensureWorkspaceForProject(code)
    return c.json({ projectCode: code, root })
  })
