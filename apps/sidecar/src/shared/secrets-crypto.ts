import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { env } from './env'

/**
 * AES-256-GCM symmetric encryption for user-pasted secrets (Figma tokens,
 * GitHub PATs, etc.).
 *
 * The 32-byte cipher key lives at `<dataDir>/secrets.key`. On first read we
 * generate it via `crypto.randomBytes(32)` and chmod 600 (best-effort on
 * Windows — the user's profile is already access-controlled). The DB only
 * stores `{iv, ciphertext, authTag}` so a leaked tortuga.db without the key
 * file reveals nothing.
 *
 * This level protects against:
 *  - Casual filesystem browsing / accidental file shares of tortuga.db
 *  - Backups uploaded somewhere without the keyfile
 *
 * It does NOT protect against an attacker with full read access to the
 * user's home directory — that scenario calls for DPAPI / Keychain integration
 * (a follow-up if it becomes relevant).
 */

const ALGO = 'aes-256-gcm'
const IV_BYTES = 12
const KEY_BYTES = 32
const TAG_BYTES = 16

let cachedKey: Buffer | null = null

function keyfilePath(): string {
  return join(env.dataDir, 'secrets.key')
}

function loadOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey
  const path = keyfilePath()
  if (existsSync(path)) {
    const buf = readFileSync(path)
    if (buf.length !== KEY_BYTES) {
      throw new Error(
        `secrets.key has wrong length (${buf.length} bytes, expected ${KEY_BYTES}). Refusing to start to avoid corrupting existing data.`,
      )
    }
    cachedKey = buf
    return cachedKey
  }
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const fresh = randomBytes(KEY_BYTES)
  writeFileSync(path, fresh, { mode: 0o600 })
  try {
    chmodSync(path, 0o600)
  } catch {
    // chmod is best-effort on Windows; the user's profile is already
    // access-controlled at the OS level.
  }
  cachedKey = fresh
  return cachedKey
}

export interface EncryptedSecret {
  iv: string
  ciphertext: string
  authTag: string
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = loadOrCreateKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES })
  const ct = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    ciphertext: ct.toString('base64'),
    authTag: tag.toString('base64'),
  }
}

export function decryptSecret(enc: EncryptedSecret): string {
  const key = loadOrCreateKey()
  const iv = Buffer.from(enc.iv, 'base64')
  const ciphertext = Buffer.from(enc.ciphertext, 'base64')
  const authTag = Buffer.from(enc.authTag, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES })
  if (authTag.length !== TAG_BYTES) {
    throw new Error('secrets-crypto: invalid auth tag length')
  }
  decipher.setAuthTag(authTag)
  const pt = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return pt.toString('utf-8')
}

/** Tests only — reset the cached key so a different keyfile path is picked up. */
export function _resetCryptoCacheForTests(): void {
  cachedKey = null
}
