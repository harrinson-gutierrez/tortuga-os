/**
 * Shared dependency bundle injected into every use-case.
 *
 * The use-case asks for what it needs (storage + identity + clock). Tests
 * inject fakes; production injects the SQLite adapter + crypto.randomUUID
 * + Date.now.
 */

import type { Storage } from './storage/port'

export interface EncryptedBlob {
  ciphertext: string
  iv: string
  authTag: string
}

/**
 * Symmetric crypto for secrets. The sidecar provides a real AES-256-GCM
 * implementation keyed off the handshake token; tests inject a fake
 * that just hex-encodes plaintext so the use-case logic is exercised
 * without depending on node:crypto.
 */
export interface SecretCipher {
  encrypt(plaintext: string): EncryptedBlob
  decrypt(blob: EncryptedBlob): string
}

export interface CoreDeps {
  storage: Storage
  newId: () => string
  now: () => number
  /**
   * Optional: when present, secrets use cases use it to en/decrypt
   * values. When absent (older callsites that don't deal with secrets),
   * the use case throws a clear error if you reach the cipher path.
   */
  secretCipher?: SecretCipher
}
