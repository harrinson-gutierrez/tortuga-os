/**
 * AES-256-GCM cipher used by the secrets use cases.
 *
 * Key derivation: SHA-256 of the sidecar's handshake token. This means
 * the encryption key is unique per install and rotates if the operator
 * regenerates the token. There's no way to decrypt the secrets in DB
 * without running this exact sidecar process — exactly what we want.
 *
 * If TORTUGA_HANDSHAKE_TOKEN is not set (standalone dev mode), we fall
 * back to a fixed dev key so the use-case still works for local
 * development. The fallback prints a loud warning on first use.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { EncryptedBlob, SecretCipher } from '@tortuga-os/core'
import { logger } from './logger'

const DEV_FALLBACK_TOKEN = 'tortuga-os-dev-secrets-master-key-fallback'

function deriveKey(): Buffer {
  const token = process.env.TORTUGA_HANDSHAKE_TOKEN
  if (!token || token.length === 0) {
    if (!devWarned) {
      devWarned = true
      logger.warn(
        'secret-cipher: TORTUGA_HANDSHAKE_TOKEN not set — using DEV fallback key. Secrets stored now WILL NOT decrypt in production.',
      )
    }
    return createHash('sha256').update(DEV_FALLBACK_TOKEN).digest()
  }
  return createHash('sha256').update(token).digest()
}

let devWarned = false

export function createSecretCipher(): SecretCipher {
  return {
    encrypt(plaintext: string): EncryptedBlob {
      const key = deriveKey()
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
      const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const authTag = cipher.getAuthTag()
      return {
        ciphertext: enc.toString('hex'),
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
      }
    },
    decrypt(blob: EncryptedBlob): string {
      const key = deriveKey()
      const iv = Buffer.from(blob.iv, 'hex')
      const authTag = Buffer.from(blob.authTag, 'hex')
      const ciphertext = Buffer.from(blob.ciphertext, 'hex')
      const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
      if (authTag.length !== 16) {
        throw new Error('secret-cipher: invalid auth tag length')
      }
      decipher.setAuthTag(authTag)
      const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      return dec.toString('utf8')
    },
  }
}
