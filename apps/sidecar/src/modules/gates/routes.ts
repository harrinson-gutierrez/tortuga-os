import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { systemPromptFor } from '@tortuga-os/agent-runner'
import { GATE_TYPES, type GateType } from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import { Hono } from 'hono'
import { z } from 'zod'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { workspacePathFor } from '../workspace/use-cases'
import { commandFor } from './runner'
import { type CleanResult, type RunGatesResult, cleanWorkspace, runGatesForTask } from './service'

const RepairGateBody = z.object({
  gateType: z.enum(GATE_TYPES),
  gateLabel: z.string().min(1).max(200),
  log: z.string().min(1),
})

function buildGateRepairPrompt(taskId: string, input: z.infer<typeof RepairGateBody>): string {
  const tail = input.log.length > 8000 ? `…(truncated)…\n${input.log.slice(-8000)}` : input.log
  return [
    '# Gate repair request',
    '',
    `Task: ${taskId}`,
    `Gate: ${input.gateType} (${input.gateLabel})`,
    '',
    'Your workspace cwd resolves to the project root. Run flutter from',
    '`05-build/app` (e.g. `cd 05-build/app && flutter test ...`).',
    `Repair until the gate's exact command exits 0.`,
    '',
    '## Failed gate log',
    '',
    '```',
    tail,
    '```',
    '',
    '## What to do now',
    '',
    '1. Read the first lines of the log to find the exact command that ran (after `[gate] $`).',
    '2. Diagnose the failure in ONE sentence.',
    '3. Apply the fix (edit files, run pub add/remove, --update-goldens, etc).',
    '4. Re-run the exact same gate command.',
    '5. Iterate up to 3 times.',
    '6. Write a short `GATE_REPAIR_NOTES.md` at the workspace root summarising the fix.',
    '7. End your final message with a single line `OK` (success) or `GAVE_UP: <reason>`.',
  ].join('\n')
}

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

  .post('/clean/:taskId', async (c) => {
    const taskId = c.req.param('taskId')
    const raw = await c.req.json().catch(() => ({}))
    const body = CleanBody.parse(raw)
    const result: CleanResult = await cleanWorkspace(taskId, body.stack)
    return c.json(result, 200)
  })

  .post('/repair/:taskId', async (c) => {
    const taskId = c.req.param('taskId')
    const raw = await c.req.json().catch(() => ({}))
    const body = RepairGateBody.safeParse(raw)
    if (!body.success) return c.json({ error: body.error.message }, 400)
    const systemPrompt = systemPromptFor('gate-fixer')
    const userPrompt = buildGateRepairPrompt(taskId, body.data)
    const result = await useCases.agentRuns.queueAgentRun(coreDeps(), {
      taskId,
      agentKind: 'gate-fixer',
      provider: 'claude-cli',
      systemPrompt,
      userPrompt,
    })
    return c.json(unwrap(result), 201)
  })

  .get('/preview', (c) => {
    const stackRaw = c.req.query('stack') ?? 'flutter'
    const parsed = StackSchema.safeParse(stackRaw)
    if (!parsed.success) return c.json({ error: `unknown stack: ${stackRaw}` }, 400)
    const stack = parsed.data
    const gatesRaw = (c.req.query('gates') ?? '').split(',').filter(Boolean)
    const gates = (
      gatesRaw.length > 0
        ? gatesRaw.filter((g): g is GateType => GATE_TYPES.includes(g as GateType))
        : (GATE_TYPES as readonly GateType[])
    ).map((type) => {
      const cmd = commandFor(type, stack)
      return cmd
        ? { type, cmd: cmd.cmd, args: cmd.args, supported: true as const }
        : { type, cmd: null, args: [], supported: false as const }
    })
    return c.json({ stack, gates })
  })
