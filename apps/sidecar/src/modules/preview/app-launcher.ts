import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { projects } from '@tortuga-os/storage-sqlite'
import { eq } from 'drizzle-orm'
import { getDb } from '../../shared/db'
import { logger } from '../../shared/logger'

function resolveFlutterRepo(workspacePath: string | null, fallbackCwd: string): string | null {
  if (workspacePath) {
    // Canonical location for the deterministic scaffold flow.
    const buildApp = join(workspacePath, '05-build', 'app')
    if (existsSync(join(buildApp, 'pubspec.yaml'))) return buildApp
    // Legacy locations from earlier flows (kept for backwards-compat).
    const scaffolds = join(workspacePath, '04-architecture', 'scaffolds')
    if (existsSync(join(scaffolds, 'pubspec.yaml'))) return scaffolds
    if (existsSync(join(workspacePath, 'pubspec.yaml'))) return workspacePath
  }
  if (existsSync(join(fallbackCwd, 'pubspec.yaml'))) return fallbackCwd
  return null
}

/**
 * Launches a project's Flutter app onto a booted emulator (`flutter run -d
 * <serial>`) so the operator sees the built app react without leaving Tortuga.
 * Scoped to the PROJECT, not a single task: one launch per device serial;
 * relaunching reuses or replaces the running process.
 */

const FLUTTER_BIN = process.env.TORTUGA_FLUTTER_BIN ?? 'flutter'

/** Relative env file Tortuga's Flutter projects compile in via --dart-define. */
const DART_DEFINE_FILE = 'env/dev.json'

/**
 * Build the `flutter run` args, compiling in `env/dev.json` when the repo ships
 * one. Tortuga's Flutter apps read config (SUPABASE_URL, etc.) from a
 * dart-define file and refuse to start without it.
 */
function buildRunArgs(repo: string, serial: string): string[] {
  const args = ['run', '-d', serial]
  if (existsSync(join(repo, DART_DEFINE_FILE))) {
    args.push(`--dart-define-from-file=${DART_DEFINE_FILE}`)
  }
  return args
}

export class AppLauncherError extends Error {}

interface Launch {
  serial: string
  projectCode: string
  repo: string
  child: ChildProcess
  startedAt: number
  /**
   * Rolling buffer with the last N lines of stdout+stderr from the
   * `flutter run` process. We cap it so a long-running launch can't
   * leak memory, but keep enough lines for the operator to see what
   * happened on launch and on the latest hot-reload cycle.
   */
  log: string[]
}

const MAX_LOG_LINES = 300

const launches = new Map<string, Launch>()

export interface LaunchStatus {
  serial: string
  projectCode: string
  repo: string
  startedAt: number
  running: boolean
}

function snapshot(l: Launch): LaunchStatus {
  return {
    serial: l.serial,
    projectCode: l.projectCode,
    repo: l.repo,
    startedAt: l.startedAt,
    running: l.child.exitCode === null,
  }
}

async function resolveProjectRepo(projectCode: string): Promise<{ repo: string; label: string }> {
  const db = getDb()
  const project = await db
    .select({ code: projects.code, workspacePath: projects.workspacePath })
    .from(projects)
    .where(eq(projects.code, projectCode))
    .get()
  if (!project) throw new AppLauncherError(`Project ${projectCode} not found`)
  const repo = resolveFlutterRepo(project.workspacePath ?? null, process.cwd())
  if (!repo) {
    throw new AppLauncherError(
      'No se encontró el repo Flutter del proyecto. Asegúrate de haber completado la tarea de arquitectura (T0) — el código vive en 05-build/app/.',
    )
  }
  return { repo, label: project.code }
}

/** Launch (or relaunch) a project's app on a device. Single-active by design:
 *  any other running launch (on any serial) is stopped first, so the shared
 *  emulator only ever runs one app at a time. */
export async function launchProjectApp(projectCode: string, serial: string): Promise<LaunchStatus> {
  for (const [otherSerial, launch] of launches) {
    if (launch.child.exitCode === null) launch.child.kill()
    launches.delete(otherSerial)
  }
  const { repo, label } = await resolveProjectRepo(projectCode)

  const child = spawn(FLUTTER_BIN, buildRunArgs(repo, serial), {
    cwd: repo,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  const launch: Launch = {
    serial,
    projectCode: label,
    repo,
    child,
    startedAt: Date.now(),
    log: [`▶ flutter ${buildRunArgs(repo, serial).join(' ')}  (cwd: ${repo})`],
  }
  launches.set(serial, launch)
  const pushLine = (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue
      launch.log.push(line)
      if (launch.log.length > MAX_LOG_LINES) {
        launch.log.splice(0, launch.log.length - MAX_LOG_LINES)
      }
    }
  }
  child.stdout?.on('data', pushLine)
  child.stderr?.on('data', pushLine)
  child.on('exit', (code) => {
    launch.log.push(`◾ flutter run exited (code=${code})`)
    logger.info({ serial, projectCode: label, code }, 'flutter run exited')
  })
  child.on('error', (err) => {
    launch.log.push(`✗ failed to start: ${err.message}`)
    logger.error({ serial, projectCode: label, err: err.message }, 'flutter run failed to start')
  })
  logger.info({ serial, projectCode: label, repo }, 'Launching project app on device')
  return snapshot(launch)
}

/**
 * Returns the rolling log buffer for the most recent launch on a serial.
 * Used by the UI to render a live transcript of `flutter run` output —
 * Gradle progress lines, deprecation warnings, dart hot-reload prompts,
 * install errors. Returns null when there has been no launch for that
 * serial in this sidecar session.
 */
export function getLaunchLog(serial: string): {
  serial: string
  projectCode: string
  running: boolean
  startedAt: number
  lines: string[]
} | null {
  const launch = launches.get(serial)
  if (!launch) return null
  return {
    serial,
    projectCode: launch.projectCode,
    running: launch.child.exitCode === null,
    startedAt: launch.startedAt,
    lines: [...launch.log],
  }
}

/** Stop the app launched on a device. */
export function stopTaskApp(serial: string): { ok: boolean } {
  const launch = launches.get(serial)
  if (launch && launch.child.exitCode === null) {
    launch.child.kill()
  }
  launches.delete(serial)
  return { ok: true }
}

/** Status of all app launches this session. */
export function appLaunchStatus(): LaunchStatus[] {
  return [...launches.values()].map(snapshot)
}
