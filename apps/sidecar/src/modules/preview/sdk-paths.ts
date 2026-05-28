import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { env } from '../../shared/env'

/**
 * Locates the Android SDK and the binaries the preview module needs
 * (`emulator`, `adb`). Resolution order for the SDK root:
 *   1. TORTUGA_ANDROID_SDK (explicit override)
 *   2. ANDROID_HOME / ANDROID_SDK_ROOT (the SDK's own conventions)
 *   3. The per-OS default install location
 *
 * `adb` is already on PATH in most setups (device.ts relies on that), so we
 * only fall back to the SDK copy when a direct `adb` is unavailable. The
 * `emulator` binary is almost never on PATH, so we resolve it from the SDK.
 */

const EXE = process.platform === 'win32' ? '.exe' : ''

function defaultSdkRoot(): string | null {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA
    if (local) return join(local, 'Android', 'Sdk')
    return null
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Android', 'sdk')
  }
  return join(homedir(), 'Android', 'Sdk')
}

/** Resolve the Android SDK root, or null when it cannot be located. */
export function resolveSdkRoot(): string | null {
  const candidates = [
    process.env.TORTUGA_ANDROID_SDK,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    defaultSdkRoot(),
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) return c
  }
  return null
}

/** Absolute path to the `emulator` binary, or null when the SDK is missing it. */
export function resolveEmulatorBin(): string | null {
  if (process.env.TORTUGA_EMULATOR_BIN) return process.env.TORTUGA_EMULATOR_BIN
  const sdk = resolveSdkRoot()
  if (!sdk) return null
  const bin = join(sdk, 'emulator', `emulator${EXE}`)
  return existsSync(bin) ? bin : null
}

/** Resolve `adb`: prefer the SDK copy, fall back to PATH lookup ('adb'). */
export function resolveAdbBin(): string {
  if (process.env.TORTUGA_ADB_BIN) return process.env.TORTUGA_ADB_BIN
  const sdk = resolveSdkRoot()
  if (sdk) {
    const bin = join(sdk, 'platform-tools', `adb${EXE}`)
    if (existsSync(bin)) return bin
  }
  return 'adb'
}

/** Version of the bundled scrcpy server — must match the AdbScrcpyOptions class
 *  the bridge uses. Tango supports up to 3.3.3; we ship v3.3.1. */
export const SCRCPY_SERVER_VERSION = '3.3.1'

/** Absolute path to the bundled scrcpy-server jar, or null when missing.
 *  Looks under `<resource>/scrcpy-server-v<version>` (bundled) then the dev
 *  `apps/sidecar/resources/` copy. */
export function resolveScrcpyServer(): string | null {
  if (process.env.TORTUGA_SCRCPY_SERVER) return process.env.TORTUGA_SCRCPY_SERVER
  const name = `scrcpy-server-v${SCRCPY_SERVER_VERSION}`
  const candidates = [
    join(env.resourceDir, name),
    join(env.resourceDir, 'apps/sidecar/resources', name),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}
