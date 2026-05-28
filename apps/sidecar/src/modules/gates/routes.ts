import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GATE_TYPES, type GateType } from '@tortuga-os/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { coreDeps } from '../../shared/core-deps'
import { workspacePathFor } from '../workspace/use-cases'
import { type CleanResult, type RunGatesResult, cleanWorkspace, runGatesForTask } from './service'

const StackSchema = z.enum(['flutter', 'nextjs', 'vite-react', 'angular', 'astro', 'node'])

const RunGatesBody = z.object({
  stack: StackSchema.default('node'),
  gates: z.array(z.enum(GATE_TYPES)).min(1).default(['G1_ANALYZE', 'G3_BUILD']),
})

const CleanBody = z.object({
  stack: StackSchema.default('flutter'),
})

export const gatesRunRouter = new Hono()
  .post('/run/:taskId', async (c) => {
    const taskId = c.req.param('taskId')
    const raw = await c.req.json().catch(() => ({}))
    const body = RunGatesBody.parse(raw)
    const result: RunGatesResult = await runGatesForTask(taskId, body.stack, body.gates)
    return c.json(result, 200)
  })
  // Tail the live gate log so the UI can render output as the gate is
  // still running. The runner writes to a WriteStream from the first
  // child stdout chunk on; the UI polls this endpoint every ~500ms and
  // streams the deltas into a textarea.
  //
  // GET /api/gates/log/:taskId?gate=G6_REAL_WORK&offset=12345
  // Response: { offset: number, size: number, chunk: string, done: boolean }
  //   offset: byte offset where the returned chunk starts (= input offset)
  //   size:   total file size right now (use as next offset)
  //   chunk:  bytes from offset to size, utf-8 decoded
  //   done:   true if the gate row in DB is no longer 'pending'
  .get('/log/:taskId', async (c) => {
    const taskId = c.req.param('taskId')
    const gateTypeRaw = c.req.query('gate') ?? ''
    if (!GATE_TYPES.includes(gateTypeRaw as GateType)) {
      return c.json({ error: `unknown gate: ${gateTypeRaw}` }, 400)
    }
    const gateType = gateTypeRaw as GateType
    const inputOffset = Math.max(0, Number.parseInt(c.req.query('offset') ?? '0', 10) || 0)

    const deps = coreDeps()
    const task = await deps.storage.getTaskById(taskId)
    if (!task) return c.json({ error: `task ${taskId} not found` }, 404)
    const story = await deps.storage.getStoryById(task.storyId)
    if (!story) return c.json({ error: 'story not found' }, 404)
    const quote = await deps.storage.getQuoteById(story.quoteId)
    if (!quote) return c.json({ error: 'quote not found' }, 404)
    const phase = await deps.storage.getPhaseById(quote.phaseId)
    if (!phase) return c.json({ error: 'phase not found' }, 404)
    const project = await deps.storage.getProjectById(phase.projectId)
    if (!project) return c.json({ error: 'project not found' }, 404)
    const workspace = project.workspacePath ?? workspacePathFor(project.code)

    const logPath = join(
      workspace,
      '05-build',
      '_gates',
      task.code,
      `n${task.currentIteration}`,
      `${gateType}.log`,
    )

    let size = 0
    let chunk = ''
    if (existsSync(logPath)) {
      size = statSync(logPath).size
      if (size > inputOffset) {
        const fd = openSync(logPath, 'r')
        const length = size - inputOffset
        const buffer = Buffer.alloc(length)
        readSync(fd, buffer, 0, length, inputOffset)
        closeSync(fd)
        chunk = buffer.toString('utf-8')
      }
    }

    const iterations = await deps.storage.listIterationsForTask(taskId)
    const current = iterations.find((it) => it.n === task.currentIteration)
    let done = false
    if (current) {
      const gates = await deps.storage.listGatesForIteration(current.id)
      const g = gates.find((x) => x.gateType === gateType)
      done = !!g && g.status !== 'pending'
    }

    return c.json({ offset: inputOffset, size, chunk, done })
  })

  // Runs `flutter clean` (or stack equivalent) in the project workspace.
  // Used to recover from transient Gradle/build-cache failures.
  .post('/clean/:taskId', async (c) => {
    const taskId = c.req.param('taskId')
    const raw = await c.req.json().catch(() => ({}))
    const body = CleanBody.parse(raw)
    const result: CleanResult = await cleanWorkspace(taskId, body.stack)
    return c.json(result, 200)
  })
