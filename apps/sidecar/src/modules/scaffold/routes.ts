import { systemPromptFor } from '@tortuga-os/agent-runner'
import { useCases } from '@tortuga-os/core'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { validateBody } from '../../shared/validate'
import {
  previewScaffold,
  readScaffoldHistory,
  runScaffold,
} from './service'
import { workspacePathFor } from '../workspace/use-cases'

const PreviewBody = z.object({
  projectCode: z.string().min(1).max(64),
  stack: z.string().min(1).max(64),
})

const RunBody = z.object({
  projectCode: z.string().min(1).max(64),
  stack: z.string().min(1).max(64),
})

const RepairBody = z.object({
  projectCode: z.string().min(1).max(64),
  taskId: z.string().min(1).max(64),
  stack: z.string().min(1).max(64),
  failedSteps: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      log: z.string(),
    }),
  ),
})

function buildRepairPrompt(input: z.infer<typeof RepairBody>): string {
  const stepsBlock = input.failedSteps
    .map(
      (s) =>
        `### Step "${s.id}" (${s.label}) — FAILED\n\n\`\`\`\n${s.log.slice(-4000)}\n\`\`\``,
    )
    .join('\n\n')
  return [
    `# Scaffold repair request`,
    ``,
    `Project: ${input.projectCode}`,
    `Stack: ${input.stack}`,
    `Task: ${input.taskId}`,
    ``,
    `The deterministic scaffold pipeline finished but the following`,
    `verify steps failed. The Flutter project lives in \`05-build/app/\``,
    `RELATIVE to your WORKSPACE_ROOT. ALL flutter commands MUST run with`,
    `\`cd 05-build/app && flutter ...\` — never from the workspace root.`,
    `Repair until \`flutter analyze\` and \`flutter test\` both exit 0.`,
    ``,
    `## Failed steps`,
    ``,
    stepsBlock,
    ``,
    `## What to do now`,
    ``,
    `1. \`cd 05-build/app && cat pubspec.yaml\` and \`flutter --version\` to ground yourself.`,
    `2. Diagnose. Edit \`05-build/app/pubspec.yaml\` and \`05-build/app/test/*\` files as needed.`,
    `3. \`cd 05-build/app && flutter pub get && flutter analyze --no-pub --no-fatal-infos\`.`,
    `4. When analyze passes, \`cd 05-build/app && flutter test --reporter=expanded\`.`,
    `5. Iterate until both pass or you hit ~6 attempts.`,
    `6. Write \`REPAIR_SUMMARY.md\` at the workspace root (NOT inside 05-build/app).`,
    `7. End with a single line: \`OK\` or \`GAVE_UP: <reason>\`.`,
  ].join('\n')
}

export const scaffoldRouter = new Hono()
  .get('/history/:projectCode', (c) => {
    const projectCode = c.req.param('projectCode')
    try {
      const workspace = workspacePathFor(projectCode)
      const history = readScaffoldHistory(workspace)
      return c.json(history)
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404)
    }
  })
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

  // Queue an agent run with kind 'scaffold-fixer'. The agent receives the
  // failing step logs, edits pubspec / test files, and iterates until
  // flutter analyze + test both pass. Returns { runId } so the UI can
  // follow the existing agent-runs streaming view.
  .post('/repair', async (c) => {
    const v = await validateBody(c, RepairBody)
    if (!v.success) return v.response
    const systemPrompt = systemPromptFor('scaffold-fixer')
    const userPrompt = buildRepairPrompt(v.data)
    const result = await useCases.agentRuns.queueAgentRun(coreDeps(), {
      taskId: v.data.taskId,
      agentKind: 'scaffold-fixer',
      provider: 'claude-cli',
      systemPrompt,
      userPrompt,
    })
    return c.json(unwrap(result), 201)
  })
