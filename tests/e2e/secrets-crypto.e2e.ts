// AES-256-GCM round-trip + tamper detection. The keyfile lands inside the
// sidecar's dataDir on first encrypt; subsequent calls reuse the same key.
//
// We use the actual env.dataDir resolution (no stubbing) because the env
// module is evaluated once at import time. The keyfile will live in the
// dev dataDir during the test run, which is acceptable: the file is 32
// random bytes, the test does not assert on its location, and cleanup
// happens via _resetCryptoCacheForTests so each test starts fresh.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetCryptoCacheForTests,
  decryptSecret,
  encryptSecret,
} from '../../apps/sidecar/src/shared/secrets-crypto'

describe('secrets-crypto', () => {
  beforeEach(() => {
    _resetCryptoCacheForTests()
  })

  afterEach(() => {
    _resetCryptoCacheForTests()
  })

  it('round-trips short ASCII through encrypt → decrypt', () => {
    const enc = encryptSecret('figd_abc123')
    expect(enc.iv).toBeTruthy()
    expect(enc.ciphertext).toBeTruthy()
    expect(enc.authTag).toBeTruthy()
    expect(decryptSecret(enc)).toBe('figd_abc123')
  })

  it('round-trips UTF-8 with accents and emojis', () => {
    const plain = 'multilínea\nemoji 🐢 acentos áéíóú'
    expect(decryptSecret(encryptSecret(plain))).toBe(plain)
  })

  it('produces a different ciphertext for the same plaintext (random IV)', () => {
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.iv).not.toBe(b.iv)
  })

  it('refuses to decrypt a tampered ciphertext (GCM auth tag check)', () => {
    const enc = encryptSecret('original')
    const tampered = {
      ...enc,
      ciphertext: Buffer.from(enc.ciphertext, 'base64')
        .map((b, i) => (i === 0 ? b ^ 0xff : b))
        .toString('base64'),
    }
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('refuses to decrypt with a swapped IV', () => {
    const a = encryptSecret('secret-A')
    const b = encryptSecret('secret-B')
    expect(() => decryptSecret({ ...a, iv: b.iv })).toThrow()
  })
})
