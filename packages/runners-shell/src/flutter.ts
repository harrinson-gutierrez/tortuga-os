import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { type SpawnResult, runProcess } from './spawn'

const FLUTTER_BIN = process.env.TORTUGA_FLUTTER_BIN ?? 'flutter'
const DEFAULT_DART_DEFINE_FILE = 'env/dev.json'

export interface FlutterContext {
  /** Absolute path to the Flutter project root (contains pubspec.yaml). */
  cwd: string
  /** Relative path inside cwd to a dart-define file; defaults to env/dev.json if present. */
  dartDefineFile?: string
  /** Per-invocation timeout in ms. Default 5 min. */
  timeoutMs?: number
}

function withDartDefine(ctx: FlutterContext, args: string[]): string[] {
  const file = ctx.dartDefineFile ?? DEFAULT_DART_DEFINE_FILE
  if (existsSync(join(ctx.cwd, file))) {
    return [...args, `--dart-define-from-file=${file}`]
  }
  return args
}

export async function flutterAnalyze(ctx: FlutterContext): Promise<SpawnResult> {
  return runProcess({
    command: FLUTTER_BIN,
    args: ['analyze', '--no-fatal-infos'],
    cwd: ctx.cwd,
    timeoutMs: ctx.timeoutMs ?? 5 * 60_000,
  })
}

export async function flutterBuildApkDebug(ctx: FlutterContext): Promise<SpawnResult> {
  return runProcess({
    command: FLUTTER_BIN,
    args: withDartDefine(ctx, ['build', 'apk', '--debug']),
    cwd: ctx.cwd,
    timeoutMs: ctx.timeoutMs ?? 10 * 60_000,
  })
}

export async function flutterTest(ctx: FlutterContext): Promise<SpawnResult> {
  return runProcess({
    command: FLUTTER_BIN,
    args: ['test'],
    cwd: ctx.cwd,
    timeoutMs: ctx.timeoutMs ?? 10 * 60_000,
  })
}

export async function flutterRun(ctx: FlutterContext, serial: string): Promise<SpawnResult> {
  return runProcess({
    command: FLUTTER_BIN,
    args: withDartDefine(ctx, ['run', '-d', serial]),
    cwd: ctx.cwd,
    timeoutMs: ctx.timeoutMs ?? 30 * 60_000,
  })
}
