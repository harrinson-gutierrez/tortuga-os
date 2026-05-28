/**
 * Per-project NON-SECRET env vars scoped by environment (dev/staging/prod).
 * For secrets (API keys, tokens), use the `secrets` use-case which
 * encrypts at rest. ProjectEnv values land in DB as plain text.
 */

import type {
  CreateProjectEnvInput,
  PatchProjectEnvInput,
  ProjectEnvDTO,
  ProjectEnvironment,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, ucOk, validation } from '../errors'
import { projectEnvDTO } from '../mappers'

const NAME_RE = /^[A-Z][A-Z0-9_]*$/

export async function listProjectEnvs(
  { storage }: CoreDeps,
  projectCode: string,
  environment?: ProjectEnvironment,
): Promise<UseCaseResult<ProjectEnvDTO[]>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const rows = await storage.listProjectEnvs(proj.project.id, environment)
  return ucOk(rows.map(projectEnvDTO))
}

export async function createProjectEnv(
  { storage, newId, now }: CoreDeps,
  projectCode: string,
  input: CreateProjectEnvInput,
): Promise<UseCaseResult<ProjectEnvDTO>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  if (!NAME_RE.test(input.name)) {
    return validation('name', 'name must match /^[A-Z][A-Z0-9_]*$/')
  }
  const dupe = await storage.getProjectEnvByName(proj.project.id, input.environment, input.name)
  if (dupe) {
    return conflict(
      `env var "${input.name}" already exists for ${projectCode}/${input.environment}`,
    )
  }
  const row = await storage.createProjectEnv({
    id: newId(),
    projectId: proj.project.id,
    environment: input.environment,
    name: input.name,
    value: input.value,
    description: input.description ?? null,
    now: now(),
  })
  return ucOk(projectEnvDTO(row))
}

export async function patchProjectEnv(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchProjectEnvInput,
): Promise<UseCaseResult<ProjectEnvDTO>> {
  const existing = await storage.getProjectEnvById(id)
  if (!existing) return notFound('project_env', id)
  const row = await storage.patchProjectEnv({
    id,
    patch: {
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
    now: now(),
  })
  return ucOk(projectEnvDTO(row))
}

export async function deleteProjectEnv(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getProjectEnvById(id)
  if (!existing) return notFound('project_env', id)
  await storage.softDeleteProjectEnv(id, now())
  return ucOk({ ok: true })
}
