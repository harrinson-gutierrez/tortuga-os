/**
 * Per-project secrets. Plaintext value is encrypted via the
 * SecretCipher in CoreDeps before storage; on read, only the metadata
 * (DTO) is returned. Use `revealSecret` to decrypt (logged on the
 * sidecar side).
 */

import type { CreateSecretInput, PatchSecretInput, SecretDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, ucOk, validation } from '../errors'
import { secretDTO } from '../mappers'

function requireCipher(deps: CoreDeps) {
  if (!deps.secretCipher) {
    throw new Error(
      'secrets use-case called without a SecretCipher in CoreDeps — wire one up in the sidecar bootstrap',
    )
  }
  return deps.secretCipher
}

export async function listSecretsForProject(
  deps: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<SecretDTO[]>> {
  const proj = await deps.storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const rows = await deps.storage.listSecretsForProject(proj.project.id)
  return ucOk(rows.map(secretDTO))
}

export async function createSecret(
  deps: CoreDeps,
  input: CreateSecretInput,
): Promise<UseCaseResult<SecretDTO>> {
  const proj = await deps.storage.getProjectByCode(input.projectCode)
  if (!proj) return notFound('project', input.projectCode)
  const dupe = await deps.storage.getSecretByName(proj.project.id, input.name)
  if (dupe) return conflict(`secret "${input.name}" already exists in project ${input.projectCode}`)
  const cipher = requireCipher(deps)
  const blob = cipher.encrypt(input.value)
  const row = await deps.storage.createSecret({
    id: deps.newId(),
    projectId: proj.project.id,
    name: input.name,
    description: input.description ?? null,
    valueCiphertext: blob.ciphertext,
    iv: blob.iv,
    authTag: blob.authTag,
    now: deps.now(),
  })
  return ucOk(secretDTO(row))
}

export async function patchSecret(
  deps: CoreDeps,
  id: string,
  input: PatchSecretInput,
): Promise<UseCaseResult<SecretDTO>> {
  const existing = await deps.storage.getSecretById(id)
  if (!existing) return notFound('secret', id)
  const patch: Parameters<typeof deps.storage.patchSecret>[0]['patch'] = {}
  if (input.description !== undefined) patch.description = input.description
  if (input.value !== undefined) {
    const cipher = requireCipher(deps)
    const blob = cipher.encrypt(input.value)
    patch.valueCiphertext = blob.ciphertext
    patch.iv = blob.iv
    patch.authTag = blob.authTag
  }
  const row = await deps.storage.patchSecret({ id, patch, now: deps.now() })
  return ucOk(secretDTO(row))
}

export async function deleteSecret(
  deps: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await deps.storage.getSecretById(id)
  if (!existing) return notFound('secret', id)
  await deps.storage.deleteSecret(id)
  return ucOk({ ok: true })
}

/**
 * Decrypt and return the plaintext value. The sidecar's route handler
 * should log every call to this — it's the audit point.
 */
export async function revealSecret(
  deps: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ id: string; name: string; value: string }>> {
  const existing = await deps.storage.getSecretById(id)
  if (!existing) return notFound('secret', id)
  const cipher = requireCipher(deps)
  try {
    const value = cipher.decrypt({
      ciphertext: existing.valueCiphertext,
      iv: existing.iv,
      authTag: existing.authTag,
    })
    return ucOk({ id: existing.id, name: existing.name, value })
  } catch (err) {
    return validation('crypto', `decrypt failed for secret ${id}: ${(err as Error).message}`)
  }
}

/**
 * Decrypt every secret of a project into a plain Record<string,string>
 * suitable for injecting into a child process env. Called by the
 * agent-run worker to enrich the subprocess's env vars; never exposed
 * via HTTP.
 */
export async function decryptSecretsForProject(
  deps: CoreDeps,
  projectId: string,
): Promise<Record<string, string>> {
  const rows = await deps.storage.listSecretsForProject(projectId)
  if (rows.length === 0) return {}
  const cipher = requireCipher(deps)
  const out: Record<string, string> = {}
  for (const row of rows) {
    try {
      out[row.name] = cipher.decrypt({
        ciphertext: row.valueCiphertext,
        iv: row.iv,
        authTag: row.authTag,
      })
    } catch {
      /* skip undecryptable rows; the agent gets the env without that key */
    }
  }
  return out
}
