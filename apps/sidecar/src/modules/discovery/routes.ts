import { SendDiscoveryMessageInput } from '@tortuga-os/contracts'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  approveDraftAndMaterialize,
  loadConversation,
  sendUserMessage,
  startOrLoadConversation,
  streamUserMessage,
} from './service'

export const discoveryRouter = new Hono()
  // GET or create the active conversation for a project.
  // Optional `?provider=anthropic-sdk|claude-cli` (default: claude-cli).
  .get('/projects/:code/conversation', async (c) => {
    const code = c.req.param('code')
    const rawProvider = c.req.query('provider')
    const provider =
      rawProvider === 'anthropic-sdk' || rawProvider === 'claude-cli' ? rawProvider : 'claude-cli'
    const result = await startOrLoadConversation(code, provider)
    return c.json(result)
  })

  // Refresh a conversation by id (used for polling after a send).
  .get('/conversations/:id', async (c) => {
    const id = c.req.param('id')
    const result = await loadConversation(id)
    return c.json(result)
  })

  // Send a user message and get the agent's reply.
  .post('/conversations/:id/messages', async (c) => {
    const id = c.req.param('id')
    const body = SendDiscoveryMessageInput.parse(await c.req.json())
    const result = await sendUserMessage(id, body.content)
    return c.json(result, 201)
  })

  // Streaming variant: emits Server-Sent Events as tokens arrive.
  .post('/conversations/:id/messages/stream', async (c) => {
    const id = c.req.param('id')
    const body = SendDiscoveryMessageInput.parse(await c.req.json())
    return streamSSE(c, async (stream) => {
      try {
        await streamUserMessage(id, body.content, async (ev) => {
          await stream.writeSSE({ data: JSON.stringify(ev) })
        })
      } catch (err) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: (err as Error).message }),
        })
      }
    })
  })

  // Approve the converged draft → materialize stories + tasks.
  .post('/conversations/:id/approve', async (c) => {
    const id = c.req.param('id')
    const result = await approveDraftAndMaterialize(id)
    return c.json(result, 201)
  })
