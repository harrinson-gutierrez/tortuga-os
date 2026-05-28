#!/usr/bin/env node
/**
 * CLI smoke check — runs G1 (analyze) + G3 (build) + G6 (real-work declared-vs-
 * changed) standalone. This is a fallback / manual smoke tool; the SIDECAR is
 * the canonical verifier and runs the full G1/G2/G3/G4/G-smoke/G5/G7 suite
 * (apps/sidecar/src/modules/agent-runs/ground-truth.ts + run-gates.ts) when a
 * task runs through the pipeline.
 *
 * Why this script does NOT call runGroundTruthGates directly: the sidecar's
 * imports (../../shared/logger) only resolve under tsx or the sidecar's own
 * build; node --experimental-strip-types in plain CLI mode cannot follow
 * extensionless relative imports. Until we add a tsx-based runner or compile
 * the sidecar first, this script stays G1+G3+G6 only and documents the gap.
 *
 * Pipeline runs ALWAYS see the full gate set; CLI runs see this subset.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type Stack = 'flutter' | 'nextjs' | 'vite-react' | 'angular' | 'astro'

interface GateResult {
  name: string
  status: 'pass' | 'fail' | 'skipped' | 'error'
  command?: string
  exitCode?: number
  logPath?: string
  durationMs?: number
  reason?: string
}

interface GateResultG6 {
  name: string
  status: 'pass' | 'fail' | 'skipped' | 'error'
  declared?: string[]
  changed?: string[]
  missing?: string[]
  unexpected?: string[]
  logPath?: string
  reason?: string
}

interface Evidence {
  task: string
  project: string
  stack: Stack
  verifierVersion: string
  startedAt: string
  finishedAt: string
  gates: {
    G1?: GateResult
    G3?: GateResult
    G6?: GateResultG6
    G2?: GateResult
    G4?: GateResult
    G5?: GateResult
    G7?: GateResult
  }
  verdict: 'approve' | 'reject'
  rejectReason?: string
  retryHint?: string
}

const VERIFIER_VERSION = '1.0.0'
const BUILD_TIMEOUT_MS = 8 * 60 * 1000

function parseArgs(argv: string[]): { project: string; task: string; stack: Stack } {
  const map = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    const val = argv[i + 1]
    if (!key?.startsWith('--') || val === undefined) {
      throw new Error(`bad arg: ${key}`)
    }
    map.set(key.slice(2), val)
  }
  const project = map.get('project')
  const task = map.get('task')
  const stack = map.get('stack') as Stack | undefined
  if (!project || !task || !stack) {
    throw new Error('usage: verify-task.ts --project <P> --task <T-id> --stack <stack>')
  }
  return { project, task, stack }
}

function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number; output: string; durationMs: number }> {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now()
    const chunks: Buffer[] = []
    const child = spawn(cmd, args, { cwd, shell: process.platform === 'win32' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      chunks.push(Buffer.from(`\n[verify-task] killed after ${timeoutMs}ms\n`))
    }, timeoutMs)
    child.stdout?.on('data', (b) => chunks.push(b))
    child.stderr?.on('data', (b) => chunks.push(b))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({
        exitCode: code ?? -1,
        output: Buffer.concat(chunks).toString('utf8'),
        durationMs: Date.now() - startedAt,
      })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolvePromise({
        exitCode: -1,
        output: `[verify-task] spawn error: ${err.message}`,
        durationMs: Date.now() - startedAt,
      })
    })
  })
}

async function runGitDiff(repoRoot: string): Promise<string[]> {
  const staged = await runCommand('git', ['diff', '--name-only', '--cached'], repoRoot, 30_000)
  const unstaged = await runCommand('git', ['diff', '--name-only'], repoRoot, 30_000)
  const untracked = await runCommand(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    repoRoot,
    30_000,
  )
  const all = `${staged.output}\n${unstaged.output}\n${untracked.output}`
  return Array.from(
    new Set(
      all
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    ),
  )
}

function gateCommandsForStack(stack: Stack): {
  analyze: { cmd: string; args: string[] }
  build: { cmd: string; args: string[] }
} {
  switch (stack) {
    case 'flutter':
      return {
        analyze: { cmd: 'flutter', args: ['analyze', '--no-pub'] },
        build: { cmd: 'flutter', args: ['build', 'apk', '--debug'] },
      }
    case 'nextjs':
    case 'vite-react':
    case 'astro':
      return {
        analyze: { cmd: 'pnpm', args: ['typecheck'] },
        build: { cmd: 'pnpm', args: ['build'] },
      }
    case 'angular':
      return {
        analyze: { cmd: 'pnpm', args: ['typecheck'] },
        build: { cmd: 'pnpm', args: ['build'] },
      }
    default:
      throw new Error(`unsupported stack: ${stack}`)
  }
}

async function main(): Promise<void> {
  const { project, task, stack } = parseArgs(process.argv.slice(2))
  const startedAt = new Date().toISOString()

  const scriptDir = fileURLToPath(new URL('.', import.meta.url))
  const tortugaRoot = resolve(scriptDir, '..')
  const repoRoot = resolve(tortugaRoot, '..')
  const projectsRoot = join(repoRoot, 'tortuga-projects')
  const taskDir = join(projectsRoot, project, '03-tareas', task)
  const evidenceDir = join(taskDir, 'evidence')
  const codeRepo = join(projectsRoot, project, '04-repos', project)
  const declaredPath = join(taskDir, 'files-declared.txt')

  await mkdir(evidenceDir, { recursive: true })

  if (!existsSync(codeRepo)) {
    const evidence: Evidence = {
      task,
      project,
      stack,
      verifierVersion: VERIFIER_VERSION,
      startedAt,
      finishedAt: new Date().toISOString(),
      gates: {},
      verdict: 'reject',
      rejectReason: `missing repo at ${relative(repoRoot, codeRepo)}`,
      retryHint: 'create the project repo before re-verifying',
    }
    await writeFile(join(evidenceDir, 'gates.json'), JSON.stringify(evidence, null, 2))
    process.stdout.write(`${evidence.verdict}\n`)
    process.exit(2)
  }

  if (!existsSync(declaredPath)) {
    const evidence: Evidence = {
      task,
      project,
      stack,
      verifierVersion: VERIFIER_VERSION,
      startedAt,
      finishedAt: new Date().toISOString(),
      gates: {
        G6: {
          name: 'real-work',
          status: 'error',
          reason: `missing ${relative(repoRoot, declaredPath)}`,
        },
      },
      verdict: 'reject',
      rejectReason: 'no files-declared.txt — builder did not declare scope',
      retryHint: 'invoke the builder; it must write files-declared.txt before coding',
    }
    await writeFile(join(evidenceDir, 'gates.json'), JSON.stringify(evidence, null, 2))
    process.stdout.write(`${evidence.verdict}\n`)
    process.exit(2)
  }

  const commands = gateCommandsForStack(stack)

  const analyzeLogPath = join(evidenceDir, 'analyze.log')
  const buildLogPath = join(evidenceDir, 'build.log')
  const filesChangedPath = join(evidenceDir, 'files-changed.txt')

  const declaredRaw = await readFile(declaredPath, 'utf8')
  const declared = declaredRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))

  const g1Run = await runCommand(commands.analyze.cmd, commands.analyze.args, codeRepo, 90_000)
  await writeFile(analyzeLogPath, g1Run.output)
  const g1: GateResult = {
    name: 'analyze',
    status: g1Run.exitCode === 0 ? 'pass' : 'fail',
    command: `${commands.analyze.cmd} ${commands.analyze.args.join(' ')}`,
    exitCode: g1Run.exitCode,
    logPath: relative(taskDir, analyzeLogPath).replace(/\\/g, '/'),
    durationMs: g1Run.durationMs,
  }

  let g3: GateResult
  if (g1.status === 'pass') {
    const g3Run = await runCommand(
      commands.build.cmd,
      commands.build.args,
      codeRepo,
      BUILD_TIMEOUT_MS,
    )
    await writeFile(buildLogPath, g3Run.output)
    g3 = {
      name: 'build',
      status: g3Run.exitCode === 0 ? 'pass' : 'fail',
      command: `${commands.build.cmd} ${commands.build.args.join(' ')}`,
      exitCode: g3Run.exitCode,
      logPath: relative(taskDir, buildLogPath).replace(/\\/g, '/'),
      durationMs: g3Run.durationMs,
    }
  } else {
    g3 = {
      name: 'build',
      status: 'skipped',
      reason: 'G1 failed; skipping build',
    }
    await writeFile(buildLogPath, '')
  }

  const changed = await runGitDiff(codeRepo)
  await writeFile(filesChangedPath, changed.join('\n'))
  const declaredSet = new Set(declared)
  const changedSet = new Set(changed)
  const missing = declared.filter((f) => !changedSet.has(f))
  const unexpected = changed.filter(
    (f) => !declaredSet.has(f) && !f.startsWith('.tortuga/') && !f.endsWith('.lock'),
  )
  const g6: GateResultG6 = {
    name: 'real-work',
    status: missing.length === 0 && declared.length > 0 ? 'pass' : 'fail',
    declared,
    changed,
    missing,
    unexpected,
    logPath: relative(taskDir, filesChangedPath).replace(/\\/g, '/'),
    reason:
      declared.length === 0
        ? 'files-declared.txt is empty'
        : missing.length > 0
          ? `${missing.length} declared file(s) not changed`
          : undefined,
  }

  const finishedAt = new Date().toISOString()
  const allGates = [g1, g3, g6]
  const failing = allGates.filter((g) => g.status === 'fail' || g.status === 'error')
  const verdict: 'approve' | 'reject' = failing.length === 0 ? 'approve' : 'reject'

  // Gates not run by this CLI smoke check — but ENFORCED by the sidecar in
  // pipeline runs (apps/sidecar/.../ground-truth.ts + run-gates.ts). They are
  // marked `delegated_to_sidecar` so the evidence file does not silently
  // suggest they were skipped without reason.
  const sidecarDelegated = (name: string): GateResult => ({
    name,
    status: 'skipped',
    reason: 'delegated_to_sidecar: pipeline runs enforce this gate; CLI smoke check does not',
  })

  const evidence: Evidence = {
    task,
    project,
    stack,
    verifierVersion: VERIFIER_VERSION,
    startedAt,
    finishedAt,
    gates: {
      G1: g1,
      G3: g3,
      G6: g6,
      G2: sidecarDelegated('architecture-lint'),
      G4: sidecarDelegated('boots'),
      G5: sidecarDelegated('figma-fidelity'),
      G7: sidecarDelegated('accessibility'),
    },
    verdict,
    rejectReason:
      verdict === 'reject'
        ? failing
            .map(
              (g) => `${g.name}: ${g.reason ?? `exit ${('exitCode' in g && g.exitCode) ?? '?'}`}`,
            )
            .join('; ')
        : undefined,
    retryHint:
      verdict === 'reject'
        ? failing.some((g) => g.name === 'real-work')
          ? 'builder must create every declared file or update files-declared.txt'
          : 'fix the failing gate(s) using the log paths in this report'
        : undefined,
  }

  await writeFile(join(evidenceDir, 'gates.json'), JSON.stringify(evidence, null, 2))
  process.stdout.write(`${evidence.verdict}\n`)
  process.exit(verdict === 'approve' ? 0 : 2)
}

main().catch((err) => {
  process.stderr.write(`[verify-task] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
