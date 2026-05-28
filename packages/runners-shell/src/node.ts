import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type SpawnResult, runProcess } from './spawn'

const PNPM_BIN = process.env.TORTUGA_PNPM_BIN ?? 'pnpm'
const NPM_BIN = process.env.TORTUGA_NPM_BIN ?? 'npm'

export interface NodeContext {
  cwd: string
  timeoutMs?: number
}

function detectPackageManager(cwd: string): 'pnpm' | 'npm' {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  return 'npm'
}

export async function runScript(ctx: NodeContext, scriptName: string): Promise<SpawnResult> {
  const pm = detectPackageManager(ctx.cwd)
  const bin = pm === 'pnpm' ? PNPM_BIN : NPM_BIN
  return runProcess({
    command: bin,
    args: pm === 'pnpm' ? [scriptName] : ['run', scriptName],
    cwd: ctx.cwd,
    timeoutMs: ctx.timeoutMs ?? 10 * 60_000,
  })
}

export async function runTypecheck(ctx: NodeContext): Promise<SpawnResult> {
  return runScript(ctx, 'typecheck')
}

export async function runBuild(ctx: NodeContext): Promise<SpawnResult> {
  return runScript(ctx, 'build')
}

export async function runTests(ctx: NodeContext): Promise<SpawnResult> {
  return runScript(ctx, 'test')
}
