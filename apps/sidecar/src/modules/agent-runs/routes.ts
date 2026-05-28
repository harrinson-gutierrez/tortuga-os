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
import { cancelInFlightRun } from './worker'

/**
 * Assembles the user-facing prompt for an agent: task code, story code,
 * goal, owner role and any extra prompt the operator typed.
 */
async function buildUserPrompt(taskId: string, extraPrompt: string | undefined): Promise<string> {
  const deps = coreDeps()
  const task = await deps.storage.getTaskById(taskId)
  if (!task) throw new Error(`task ${taskId} not found`)
  const story = await deps.storage.getStoryById(task.storyId)
  const lines: string[] = []
  lines.push('# Tortuga OS task brief')
  lines.push('')
  lines.push(`Task: **${task.code}** (type: ${task.type}, owner: ${task.ownerRole})`)
  if (story) {
    lines.push(`Story: **${story.code}** — ${story.title}`)
    lines.push(`Goal: ${story.goal}`)
    if (story.acceptanceCriteriaJson && story.acceptanceCriteriaJson !== '[]') {
      lines.push('')
      lines.push('## Acceptance criteria (JSON)')
      lines.push('```json')
      lines.push(story.acceptanceCriteriaJson)
      lines.push('```')
    }
    // For the arch/tech_lead T0 task we also dump the list of pending
    // features (stored in inputsJson as `pendingStories`) so the agent
    // knows what the project as a whole is about.
    if (
      (task.type === 'arch' || task.ownerRole === 'tech_lead') &&
      story.inputsJson &&
      story.inputsJson !== '{}'
    ) {
      lines.push('')
      lines.push('## Features de la cotización (informativo)')
      try {
        const inputs = JSON.parse(story.inputsJson) as { pendingStories?: string }
        if (inputs.pendingStories) lines.push(inputs.pendingStories)
      } catch {
        /* ignore */
      }
    }
  }

  // Inject ARCHITECTURE.md into the brief for implementation tasks so the
  // dev agent inherits the architecture decisions made by the arch T0.
  if (task.type !== 'arch' && task.ownerRole !== 'tech_lead' && story) {
    const archContent = await readArchitectureForStory(story.id)
    if (archContent) {
      lines.push('')
      lines.push('## ARCHITECTURE.md (fuente de verdad — síguelo)')
      lines.push(archContent)
    }
  }

  lines.push('')
  lines.push(`Iteration: n=${task.currentIteration}`)
  if (extraPrompt?.trim()) {
    lines.push('')
    lines.push('## Operator instructions')
    lines.push(extraPrompt.trim())
  }
  return lines.join('\n')
}

async function readArchitectureForStory(storyId: string): Promise<string | null> {
  const deps = coreDeps()
  try {
    const story = await deps.storage.getStoryById(storyId)
    if (!story) return null
    const quote = await deps.storage.getQuoteById(story.quoteId)
    if (!quote) return null
    const phase = await deps.storage.getPhaseById(quote.phaseId)
    if (!phase) return null
    const project = await deps.storage.getProjectById(phase.projectId)
    if (!project) return null
    const workspace = project.workspacePath ?? workspacePathFor(project.code)
    const archPath = join(workspace, 'ARCHITECTURE.md')
    if (!existsSync(archPath)) return null
    return readFileSync(archPath, 'utf-8')
  } catch {
    return null
  }
}

async function resolveWorkspaceForRun(runId: string): Promise<string | null> {
  const deps = coreDeps()
  const run = await deps.storage.getAgentRunById(runId)
  if (!run) return null
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
