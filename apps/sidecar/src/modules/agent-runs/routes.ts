import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { systemPromptFor } from '@tortuga-os/agent-runner'
import {
  CreateAgentRunInput,
  type QaVerdictDTO,
  type QaVerdictResponseDTO,
} from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import { Hono } from 'hono'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { NotFoundError } from '../../shared/errors'
import { workspacePathFor } from '../workspace/use-cases'
import { buildUserPrompt } from './build-prompt'
import { cancelInFlightRun } from './worker'

// buildUserPrompt lives in ./build-prompt so the coworker turn loop can reuse it.

async function resolveWorkspaceForRun(runId: string): Promise<string | null> {
  const deps = coreDeps()
  const run = await deps.storage.getAgentRunById(runId)
  if (!run) return null
  // Project-scoped runs (design/frame-assigner) resolve straight from projectId.
  if (!run.taskId) {
    if (!run.projectId) return null
    const project = await deps.storage.getProjectById(run.projectId)
    if (!project) return null
    return project.workspacePath ?? workspacePathFor(project.code)
  }
  const task = await deps.storage.getTaskById(run.taskId)
  if (!task) return null
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) return null
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) return null
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) return null
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) return null
  return project.workspacePath ?? workspacePathFor(project.code)
}

function parseQaVerdictMarkdown(output: string): QaVerdictDTO | null {
  if (!output) return null
  // Tolerant matcher: agents emit any of these shapes after "## Verdict":
  //   APPROVED
  //   `APPROVED`
  //   verdict: APPROVED
  // Strip emphasis/backticks and a leading "verdict:" label before matching
  // the actual token.
  const verdictMatch = output.match(
    /##\s*Verdict[^\n]*\n+\s*(?:verdict\s*:\s*)?[*_`]*\s*(APPROVED|REJECTED)\s*[*_`]*/i,
  )
  if (!verdictMatch) return null
  const verdict = verdictMatch[1]!.toUpperCase() as 'APPROVED' | 'REJECTED'
  const section = (name: string) => {
    const re = new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i')
    const m = output.match(re)
    return m?.[1]?.trim() ?? ''
  }
  return {
    verdict,
    acceptanceCriteria: section('Acceptance criteria'),
    defects: section('Defects'),
    notes: section('Notes'),
  }
}

function parseQaVerdictJson(raw: string): QaVerdictDTO | null {
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== 'object') return null
    const verdict = (v as { verdict?: unknown }).verdict
    if (verdict !== 'APPROVED' && verdict !== 'REJECTED') return null
    const str = (k: string): string => {
      const x = (v as Record<string, unknown>)[k]
      return typeof x === 'string' ? x : ''
    }
    return {
      verdict,
      acceptanceCriteria: str('acceptanceCriteria') || str('acceptance_criteria'),
      defects: str('defects'),
      notes: str('notes'),
    }
  } catch {
    return null
  }
}

export const agentRunsRouter = new Hono()
  .get('/:id/qa-verdict', async (c): Promise<Response> => {
    const id = c.req.param('id')
    const deps = coreDeps()
    const run = await deps.storage.getAgentRunById(id)
    if (!run) throw new NotFoundError(`agent run ${id}`)
    const workspace = await resolveWorkspaceForRun(id)
    const rawOutput = run.output ?? ''
    let verdict: QaVerdictDTO | null = null
    let source: QaVerdictResponseDTO['source'] = 'none'
    if (workspace) {
      // 1) Exact path: <runId>-verdict.json (the documented contract).
      // 2) Fallback: any *-verdict.json inside _agent-runs/, picking the
      //    one most recently written that postdates the run's start.
      //    Agents sometimes name the file by the task code instead of
      //    the run id (e.g. qa-gastuu-002-t1-n1-verdict.json); accepting
      //    that variant keeps the QA loop usable without forcing the
      //    operator to re-run.
      const runsDir = join(workspace, '05-build', '_agent-runs')
      const candidates: string[] = []
      const exact = join(runsDir, `${id}-verdict.json`)
      if (existsSync(exact)) candidates.push(exact)
      if (existsSync(runsDir)) {
        try {
          const fromDir = readdirSync(runsDir)
            .filter((f) => f.endsWith('-verdict.json') && f !== `${id}-verdict.json`)
            .map((f) => join(runsDir, f))
            .filter((p) => {
              try {
                const m = statSync(p).mtimeMs
                return run.startedAt ? m >= run.startedAt - 2000 : true
              } catch {
                return false
              }
            })
            .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
          candidates.push(...fromDir)
        } catch {
          /* ignore unreadable dir */
        }
      }
      for (const verdictPath of candidates) {
        try {
          const raw = readFileSync(verdictPath, 'utf-8')
          const parsed = parseQaVerdictJson(raw)
          if (parsed) {
            verdict = parsed
            source = 'json'
            break
          }
        } catch {
          /* unreadable file falls through */
        }
      }
    }
    if (!verdict) {
      const md = parseQaVerdictMarkdown(rawOutput)
      if (md) {
        verdict = md
        source = 'markdown'
      }
    }
    return c.json({ runId: id, source, verdict, rawOutput } satisfies QaVerdictResponseDTO)
  })
  .post('/', async (c) => {
    const body = CreateAgentRunInput.parse(await c.req.json())
    const userPrompt = await buildUserPrompt(body.taskId, body.extraPrompt)
    const systemPrompt = systemPromptFor(body.agentKind)
    const result = await useCases.agentRuns.queueAgentRun(coreDeps(), {
      ...body,
      systemPrompt,
      userPrompt,
    })
    return c.json(unwrap(result), 201)
  })
  .post('/:id/cancel', async (c) => {
    const id = c.req.param('id')
    const ok = cancelInFlightRun(id)
    return c.json({ ok }, 200)
  })
