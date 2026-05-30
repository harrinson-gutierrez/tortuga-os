import {
  SendTaskMessageInput,
  SetExecutionModeInput,
  SetTaskCoworkerPhaseInput,
} from '@tortuga-os/contracts'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import {
  getOrStartConversation,
  loadConversation,
  sendUserMessage,
  setExecutionMode,
  setPhase,
  streamUserMessage,
} from './service'

export const coworkerRouter = new Hono()
  // GET or create the active coworker conversation for a task.
  // Optional `?provider=anthropic-sdk|claude-cli` (default: claude-cli).
  .get('/tasks/:taskId/conversation', async (c) => {
    const taskId = c.req.param('taskId')
    const rawProvider = c.req.query('provider')
    const provider =
      rawProvider === 'anthropic-sdk' || rawProvider === 'claude-cli' ? rawProvider : 'claude-cli'
    const result = await getOrStartConversation(taskId, provider)
    return c.json(result)
  })

  // Refresh a conversation by id (used for polling after a send).
  .get('/conversations/:id', async (c) => {
    const id = c.req.param('id')
    const result = await loadConversation(id)
    return c.json(result)
  })

  // Send a user turn and run the dev agent; returns its reply.
  .post('/conversations/:id/messages', async (c) => {
    const id = c.req.param('id')
    const body = SendTaskMessageInput.parse(await c.req.json())
    const result = await sendUserMessage(id, body.content)
    return c.json(result, 201)
  })

  // Streaming variant: emits Server-Sent Events as the agent run progresses.
  .post('/conversations/:id/messages/stream', async (c) => {
    const id = c.req.param('id')
    const body = SendTaskMessageInput.parse(await c.req.json())
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

  // Move the conversation to an explicit phase.
  .post('/conversations/:id/phase', async (c) => {
    const id = c.req.param('id')
    const body = SetTaskCoworkerPhaseInput.parse(await c.req.json())
    const result = await setPhase(id, body.phase)
    return c.json(result)
  })

  // Switch a task between coworker and manual execution modes.
  .post('/tasks/:taskId/execution-mode', async (c) => {
    const taskId = c.req.param('taskId')
    const body = SetExecutionModeInput.parse(await c.req.json())
    const result = await setExecutionMode(taskId, body.mode)
    return c.json(result)
  })
