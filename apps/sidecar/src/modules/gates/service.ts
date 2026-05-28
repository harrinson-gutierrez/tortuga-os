import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { GateDTO, GateType } from '@tortuga-os/contracts'
import { useCases } from '@tortuga-os/core'
import { coreDeps, unwrap } from '../../shared/core-deps'
import { logger } from '../../shared/logger'
import { workspacePathFor } from '../workspace/use-cases'
import { type GateExecution, type GateStack, executeGate } from './runner'

export interface RunGatesResult {
  taskId: string
  iterationId: string
  stack: GateStack
  executions: GateExecution[]
  gates: GateDTO[]
}

async function resolveContext(taskId: string) {
  const deps = coreDeps()
  const task = await deps.storage.getTaskById(taskId)
  if (!task) throw new Error(`task ${taskId} not found`)
  const story = await deps.storage.getStoryById(task.storyId)
  if (!story) throw new Error(`story ${task.storyId} not found`)
  const quote = await deps.storage.getQuoteById(story.quoteId)
  if (!quote) throw new Error(`quote ${story.quoteId} not found`)
  const phase = await deps.storage.getPhaseById(quote.phaseId)
  if (!phase) throw new Error(`phase ${quote.phaseId} not found`)
  const project = await deps.storage.getProjectById(phase.projectId)
  if (!project) throw new Error(`project ${phase.projectId} not found`)
  const iterations = await deps.storage.listIterationsForTask(taskId)
  const current = iterations.find((it) => it.n === task.currentIteration)
  if (!current) throw new Error(`open iteration n=${task.currentIteration} not found`)
  if (current.closedAt !== null) {
    throw new Error(`current iteration of task ${taskId} is closed`)
  }
  const workspace = project.workspacePath ?? workspacePathFor(project.code)
  return { deps, task, project, iteration: current, workspace }
}

export async function runGatesForTask(
  taskId: string,
  stack: GateStack,
  gateTypes: GateType[],
): Promise<RunGatesResult> {
  const { deps, task, iteration, workspace } = await resolveContext(taskId)

  const executions: GateExecution[] = []
  const gates: GateDTO[] = []

  for (const gateType of gateTypes) {
    const existing = await deps.storage.listGatesForIteration(iteration.id)
    let gate = existing.find((g) => g.gateType === gateType)
    if (!gate) {
      gate = unwrap(
        await useCases.gates.createGate(deps, {
          taskId,
          iterationId: iteration.id,
          gateType,
        }),
      )
    } else if (gate.status !== 'pending') {
      executions.push({
        gateType,
        status: 'skipped',
        exitCode: null,
        durationMs: 0,
        outputPath: gate.outputPath ?? null,
        reason: `gate already ${gate.status}; not rerunning in MVP`,
      })
      gates.push(gate)
      continue
    }

    const exec = await executeGate(gateType, stack, workspace, task.code, iteration.n)
    executions.push(exec)
    const updated = unwrap(
      await useCases.gates.recordGateOutcome(deps, gate.id, {
        status: exec.status,
        outputPath: exec.outputPath,
      }),
    )
    gates.push(updated)
  }

  return { taskId, iterationId: iteration.id, stack, executions, gates }
}

export interface CleanResult {
  taskId: string
  stack: GateStack
  command: string
  exitCode: number
  durationMs: number
  output: string
}

/**
 * Runs the stack's canonical "clean cache" command in the workspace.
 * Used when a gate fails with a transient error (e.g. Gradle file locks
 * on Windows) — the recipe is always `flutter clean` (or equivalent),
 * then re-run the gates.
 */
export async function cleanWorkspace(taskId: string, stack: GateStack): Promise<CleanResult> {
  const { workspace } = await resolveContext(taskId)
  const cwd = stack === 'flutter' ? join(workspace, '05-build', 'app') : workspace

  const command = 'flutter'
  const args = ['clean']
  if (stack !== 'flutter') {
    // For Node/web stacks the equivalent is removing build dirs. We keep
    // this conservative: only Flutter is wired right now.
    return {
      taskId,
      stack,
      command: '(noop)',
      exitCode: 0,
      durationMs: 0,
      output: `clean step is not implemented for stack=${stack} yet`,
    }
  }

  logger.info({ taskId, stack, cwd }, 'gates.clean: starting')
  const started = Date.now()
  const out: string[] = []
  const child = spawn(command, args, {
    cwd,
    shell: process.platform === 'win32',
    windowsHide: true,
  })
  child.stdout.on('data', (b: Buffer) => out.push(b.toString('utf-8')))
  child.stderr.on('data', (b: Buffer) => out.push(b.toString('utf-8')))
  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? -1))
    child.on('error', () => resolve(-1))
  })
  const durationMs = Date.now() - started
  logger.info({ taskId, stack, exitCode, durationMs }, 'gates.clean: done')
  return {
    taskId,
    stack,
    command: `${command} ${args.join(' ')}`,
    exitCode,
    durationMs,
    output: out.join(''),
  }
}
