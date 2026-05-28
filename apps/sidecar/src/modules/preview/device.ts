import { spawn } from 'node:child_process'
import { logger } from '../../shared/logger'

/**
 * Wraps `adb` for device discovery + screenshot capture. Used by the
 * DeviceOverlay (C2 — screenshots) and by runtime-smoke (which also
 * uses scrcpy through this module).
 *
 * No `adb` binary discovery — relies on it being on PATH. If it isn't,
 * every call surfaces a helpful error so the operator installs the
 * Android SDK.
 */

const ADB_BINARY = process.env.TORTUGA_ADB_BIN ?? 'adb'
const ADB_TIMEOUT_MS = 5_000
const SCREENSHOT_TIMEOUT_MS = 8_000

export interface AdbDevice {
  serial: string
  state: 'device' | 'offline' | 'unauthorized' | 'no permissions' | 'unknown'
  model: string | null
  product: string | null
  transportId: string | null
}

async function runAdb(
  args: string[],
  timeoutMs = ADB_TIMEOUT_MS,
): Promise<{ stdout: Buffer; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ADB_BINARY, args, { windowsHide: true })
    const out: Buffer[] = []
    let err = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf-8')
    })
    child.on('error', (e) => {
      clearTimeout(timer)
      if (e.message.includes('ENOENT')) {
        reject(
          new Error(
            `'adb' not found on PATH. Install the Android SDK platform-tools (https://developer.android.com/tools/releases/platform-tools) or set TORTUGA_ADB_BIN to the full path.`,
          ),
        )
        return
      }
      reject(e)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`adb ${args.join(' ')} timed out after ${timeoutMs}ms`))
        return
      }
      resolve({ stdout: Buffer.concat(out), stderr: err, exitCode })
    })
  })
}

/**
 * `adb devices -l` returns lines like:
 *   emulator-5554 device product:sdk_gphone64_x86_64 model:sdk_gphone64_x86_64 device:emulator64_x86_64 transport_id:1
 * The first line is "List of devices attached" — we skip it.
 */
export async function listAdbDevices(): Promise<AdbDevice[]> {
  try {
    const { stdout, stderr, exitCode } = await runAdb(['devices', '-l'])
    if (exitCode !== 0) {
      logger.warn({ exitCode, stderr }, 'adb devices -l non-zero')
      return []
    }
    const text = stdout.toString('utf-8')
    const lines = text
      .split(/\r?\n/)
      .slice(1)
      .filter((l) => l.trim().length > 0)
    const devices: AdbDevice[] = []
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) continue
      const serial = parts[0]
      const stateToken = parts[1]
      if (!serial || !stateToken) continue
      const allowed = ['device', 'offline', 'unauthorized', 'no permissions'] as const
      const state: AdbDevice['state'] = (allowed as readonly string[]).includes(stateToken)
        ? (stateToken as AdbDevice['state'])
        : 'unknown'
      const kv = new Map<string, string>()
      for (const p of parts.slice(2)) {
        const eq = p.indexOf(':')
        if (eq > 0) kv.set(p.slice(0, eq), p.slice(eq + 1))
      }
      devices.push({
        serial,
        state,
        model: kv.get('model') ?? null,
        product: kv.get('product') ?? null,
        transportId: kv.get('transport_id') ?? null,
      })
    }
    return devices
  } catch (err) {
    // Surface adb-missing as an empty list with a logged warning — the
    // overlay shows "no devices" + install hint, doesn't crash.
    logger.warn({ err: (err as Error).message }, 'listAdbDevices failed')
    return []
  }
}

/**
 * `adb -s <serial> exec-out screencap -p` returns PNG bytes on stdout.
 * Cap output size at 5 MB (a typical screenshot is 200-800 KB).
 */
export async function captureScreenshot(serial: string): Promise<Buffer> {
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(serial)) {
    throw new Error(`Invalid device serial: ${serial}`)
  }
  const { stdout, stderr, exitCode } = await runAdb(
    ['-s', serial, 'exec-out', 'screencap', '-p'],
    SCREENSHOT_TIMEOUT_MS,
  )
  if (exitCode !== 0) {
    throw new Error(`adb screencap failed (${exitCode}): ${stderr.slice(0, 200)}`)
  }
  if (stdout.length === 0) {
    throw new Error('adb screencap returned empty output — is the device unlocked?')
  }
  return stdout
}

/**
 * Best-effort guess of a useful device label for the UI: prefer model,
 * fall back to product, fall back to serial.
 */
export function deviceLabel(d: AdbDevice): string {
  if (d.model) return d.model.replace(/_/g, ' ')
  if (d.product) return d.product
  return d.serial
}
