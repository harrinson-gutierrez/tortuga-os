import { type ChildProcess, spawn } from 'node:child_process'
import { logger } from '../../shared/logger'
import { listAdbDevices } from './device'
import { resolveAdbBin, resolveEmulatorBin, resolveSdkRoot } from './sdk-paths'

/**
 * Owns the Android emulator lifecycle so the operator never has to open Android
 * Studio: list AVDs, boot one, wait until it is fully booted, report status,
 * and kill it. Tortuga becomes the emulator's owner — the recurring "the
 * emulator doesn't respond" pain is a stuck/half-booted AVD nobody is managing.
 */

const BOOT_POLL_INTERVAL_MS = 2_000
const BOOT_TIMEOUT_MS = 180_000
const ADB_CMD_TIMEOUT_MS = 8_000

/** A single managed emulator process, keyed by the AVD name. `child` is null for
 *  an emulator we adopted (it was already running — we don't own its process). */
interface ManagedEmulator {
  avd: string
  child: ChildProcess | null
  serial: string | null
  startedAt: number
  state: 'booting' | 'ready' | 'stopped'
  /** Rolling buffer of emulator stdout+stderr lines so the operator can see
   *  why "Encender" is taking so long (Vulkan errors, snapshot mismatch,
   *  etc). Empty for adopted emulators since we don't own their process. */
  log: string[]
}

const MAX_EMULATOR_LOG_LINES = 200

const managed = new Map<string, ManagedEmulator>()

export interface EmulatorStatus {
  avd: string
  serial: string | null
  state: 'booting' | 'ready' | 'stopped'
  startedAt: number
}

export class EmulatorError extends Error {}

function snapshot(m: ManagedEmulator): EmulatorStatus {
  return { avd: m.avd, serial: m.serial, state: m.state, startedAt: m.startedAt }
}

/** List the AVDs defined on this machine via `emulator -list-avds`. */
export async function listAvds(): Promise<string[]> {
  const bin = resolveEmulatorBin()
  if (!bin) {
    throw new EmulatorError(
      'Android emulator binary not found. Install the Android SDK + an AVD, or set TORTUGA_EMULATOR_BIN / TORTUGA_ANDROID_SDK.',
    )
  }
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-list-avds'], { windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill(), ADB_CMD_TIMEOUT_MS)
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString('utf-8')
    })
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString('utf-8')
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new EmulatorError(`emulator -list-avds failed: ${e.message}`))
    })
    child.on('close', () => {
      clearTimeout(timer)
      if (err.trim() && !out.trim()) {
        reject(new EmulatorError(`emulator -list-avds failed: ${err.trim().slice(0, 200)}`))
        return
      }
      resolve(
        out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0),
      )
    })
  })
}

function adb(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveAdbBin(), args, { windowsHide: true })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill(), ADB_CMD_TIMEOUT_MS)
    child.stdout.on('data', (c: Buffer) => {
      out += c.toString('utf-8')
    })
    child.stderr.on('data', (c: Buffer) => {
      err += c.toString('utf-8')
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(new EmulatorError(`adb ${args.join(' ')} failed: ${e.message}`))
    })
    child.on('close', () => {
      clearTimeout(timer)
      if (err.trim() && !out.trim()) {
        reject(new EmulatorError(err.trim().slice(0, 200)))
        return
      }
      resolve(out.trim())
    })
  })
}

async function findSerialForAvd(avd: string): Promise<string | null> {
  const devices = await listAdbDevices()
  for (const d of devices) {
    if (!d.serial.startsWith('emulator-')) continue
    if (d.state !== 'device') continue
    try {
      const name = await adb(['-s', d.serial, 'emu', 'avd', 'name'])
      // `emu avd name` prints the AVD name on the first line, then "OK".
      const reported = name.split(/\r?\n/)[0]?.trim()
      if (reported === avd) return d.serial
    } catch {
      // Device may be mid-boot and not answering the console yet — skip.
    }
  }
  return null
}

async function isBootCompleted(serial: string): Promise<boolean> {
  try {
    const v = await adb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'])
    return v.trim() === '1'
  } catch {
    return false
  }
}

/**
 * The AVD's lockscreen PIN. A real credential (set to reach Play Store) cannot
 * be bypassed via `lockscreen.disabled`, so it is typed in over adb. Override
 * with `TORTUGA_EMULATOR_PIN` for a different AVD.
 */
const EMULATOR_PIN = process.env.TORTUGA_EMULATOR_PIN?.trim() || '0000'

/**
 * Wake and unlock a headless (-no-window) AVD so it lands on the home screen
 * instead of a locked, sleeping display the operator cannot unlock through the
 * embedded mirror: wake, swipe up to reveal the keypad, type the PIN, confirm.
 */
async function unlockScreen(serial: string): Promise<void> {
  try {
    await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'])
    await adb(['-s', serial, 'shell', 'input', 'swipe', '540', '1500', '540', '500'])
    await adb(['-s', serial, 'shell', 'input', 'text', EMULATOR_PIN])
    await adb(['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_ENTER'])
  } catch (err) {
    logger.warn({ serial, err: (err as Error).message }, 'unlock screen failed')
  }
}

/**
 * Boot an AVD and resolve once it has fully booted. Reuses an already-managed
 * ready instance. `-no-snapshot-load` forces a clean boot so a corrupted
 * snapshot can never leave the emulator in the half-alive state that "doesn't
 * respond".
 */
export async function bootAvd(avd: string): Promise<EmulatorStatus> {
  const existing = managed.get(avd)
  if (existing && existing.state !== 'stopped') {
    return snapshot(existing)
  }

  // Single-active rule: tasks share ONE emulator. If a different AVD is already
  // booting/ready, return it instead of starting a second VM (two emulators
  // fight the same host resources — exactly what made runs flaky).
  const otherActive = [...managed.values()].find((m) => m.state !== 'stopped')
  if (otherActive) {
    logger.info(
      { requested: avd, active: otherActive.avd },
      'Emulator already active — reusing it (single-active)',
    )
    return snapshot(otherActive)
  }

  // Adopt an emulator already running outside this session's Map — e.g. one left
  // alive across a sidecar restart, or any booted AVD. Without this, bootAvd
  // would spawn a SECOND VM that fights the running one for adb/ports and never
  // reports a serial ("Emulator did not report a serial"). adb is the source of
  // truth for what is actually up, not the in-memory Map.
  const liveSerial = await findSerialForAvd(avd)
  if (liveSerial && (await isBootCompleted(liveSerial))) {
    await unlockScreen(liveSerial)
    const adopted: ManagedEmulator = {
      avd,
      child: null,
      serial: liveSerial,
      startedAt: Date.now(),
      state: 'ready',
      log: [`◾ adopted already-running emulator (serial=${liveSerial})`],
    }
    managed.set(avd, adopted)
    logger.info({ avd, serial: liveSerial }, 'Adopted already-running emulator')
    return snapshot(adopted)
  }

  const bin = resolveEmulatorBin()
  if (!bin) {
    throw new EmulatorError(
      'Android emulator binary not found. Install the Android SDK + an AVD, or set TORTUGA_EMULATOR_BIN / TORTUGA_ANDROID_SDK.',
    )
  }
  const avds = await listAvds()
  if (!avds.includes(avd)) {
    throw new EmulatorError(`AVD "${avd}" not found. Available: ${avds.join(', ') || '(none)'}`)
  }

  // `-no-window` runs the emulator headless: its screen is mirrored into Tortuga
  // via scrcpy, so the native Android window would only be a slower duplicate.
  // `-gpu swiftshader_indirect` forces software rendering: a headless API 36
  // (Android 16) emulator crashes intermittently on the host GPU backend
  // (emu-crash-36.x dumps) — software GPU trades a little speed for stability so
  // the stream stops dropping mid-run.
  const child = spawn(
    bin,
    [
      '-avd',
      avd,
      '-no-snapshot-load',
      '-no-boot-anim',
      '-no-window',
      '-gpu',
      'swiftshader_indirect',
    ],
    {
      windowsHide: true,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const entry: ManagedEmulator = {
    avd,
    child,
    serial: null,
    startedAt: Date.now(),
    state: 'booting',
    log: [`▶ ${bin} -avd ${avd} -no-window -gpu swiftshader_indirect`],
  }
  managed.set(avd, entry)
  const pushLine = (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue
      entry.log.push(line)
      if (entry.log.length > MAX_EMULATOR_LOG_LINES) {
        entry.log.splice(0, entry.log.length - MAX_EMULATOR_LOG_LINES)
      }
    }
  }
  child.stdout?.on('data', pushLine)
  child.stderr?.on('data', pushLine)
  child.on('exit', (code) => {
    const m = managed.get(avd)
    if (m && m.child === child) {
      // On Windows `emulator -no-window` is a launcher: it spawns the detached
      // `qemu-system-*-headless` process and exits (code 1) while the VM keeps
      // running. Only treat the launcher exit as a real stop if the VM never
      // reached ready — once ready, adb (the serial) owns the lifecycle.
      if (m.state !== 'ready') m.state = 'stopped'
      m.log.push(`◾ emulator launcher exited (code=${code})`)
    }
    logger.info({ avd, code, state: m?.state }, 'Emulator launcher process exited')
  })
  logger.info({ avd, sdk: resolveSdkRoot() }, 'Booting emulator')

  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (entry.state === 'stopped') {
      throw new EmulatorError(`Emulator "${avd}" exited before finishing boot`)
    }
    if (!entry.serial) {
      entry.serial = await findSerialForAvd(avd)
    }
    if (entry.serial && (await isBootCompleted(entry.serial))) {
      await unlockScreen(entry.serial)
      entry.state = 'ready'
      logger.info({ avd, serial: entry.serial }, 'Emulator ready')
      return snapshot(entry)
    }
    await new Promise((r) => setTimeout(r, BOOT_POLL_INTERVAL_MS))
  }
  throw new EmulatorError(`Emulator "${avd}" did not finish booting within ${BOOT_TIMEOUT_MS}ms`)
}

/** Kill a running emulator. Prefers the adb console (`emu kill`), falls back to
 *  killing the spawned process. */
export async function killEmulator(avd: string): Promise<{ ok: boolean }> {
  const entry = managed.get(avd)
  const serial = entry?.serial ?? (await findSerialForAvd(avd))
  if (serial) {
    try {
      await adb(['-s', serial, 'emu', 'kill'])
    } catch (err) {
      logger.warn({ avd, serial, err: (err as Error).message }, 'emu kill failed — killing process')
      entry?.child?.kill()
    }
  } else {
    entry?.child?.kill()
  }
  if (entry) entry.state = 'stopped'
  return { ok: true }
}

/** Current status of all emulators Tortuga is managing this session. */
export function emulatorStatus(): EmulatorStatus[] {
  return [...managed.values()].map(snapshot)
}

/** The single active (booting/ready) emulator, or null. */
export function activeEmulator(): EmulatorStatus | null {
  const active = [...managed.values()].find((m) => m.state !== 'stopped')
  return active ? snapshot(active) : null
}

/**
 * Rolling log of an emulator's stdout+stderr. Used by the UI to show what's
 * happening during boot (it can take 60-120s on a cold start and feel
 * frozen otherwise). Returns null for AVDs that were never booted in this
 * sidecar session.
 */
export function getEmulatorLog(avd: string): {
  avd: string
  state: 'booting' | 'ready' | 'stopped'
  serial: string | null
  startedAt: number
  lines: string[]
} | null {
  const entry = managed.get(avd)
  if (!entry) return null
  return {
    avd: entry.avd,
    state: entry.state,
    serial: entry.serial,
    startedAt: entry.startedAt,
    lines: [...entry.log],
  }
}
