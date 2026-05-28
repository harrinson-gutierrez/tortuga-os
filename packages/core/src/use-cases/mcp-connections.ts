import type {
  CreateProjectMcpInput,
  PatchProjectMcpInput,
  ProjectMcpDTO,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, ucOk } from '../errors'
import { projectMcpDTO } from '../mappers'

export async function listProjectMcps(
  { storage }: CoreDeps,
  projectCode: string,
): Promise<UseCaseResult<ProjectMcpDTO[]>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  const rows = await storage.listProjectMcps(proj.project.id)
  return ucOk(rows.map(projectMcpDTO))
}

export async function getProjectMcp(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<ProjectMcpDTO>> {
  const row = await storage.getProjectMcpById(id)
  if (!row) return notFound('project_mcp', id)
  return ucOk(projectMcpDTO(row))
}

export async function createProjectMcp(
  { storage, newId, now }: CoreDeps,
  projectCode: string,
  input: CreateProjectMcpInput,
): Promise<UseCaseResult<ProjectMcpDTO>> {
  const proj = await storage.getProjectByCode(projectCode)
  if (!proj) return notFound('project', projectCode)
  // Unique (project_id, name) — case-sensitive, matches the index.
  const dupe = await storage.getProjectMcpByName(proj.project.id, input.name)
  if (dupe) {
    return conflict(`mcp "${input.name}" already exists for project ${projectCode}`)
  }
  const row = await storage.createProjectMcp({
    id: newId(),
    projectId: proj.project.id,
    name: input.name,
    description: input.description ?? null,
    transport: input.transport,
    enabled: input.enabled ?? true,
    command: input.transport === 'stdio' ? (input.command ?? '') : '',
    argsJson: JSON.stringify(input.transport === 'stdio' ? (input.args ?? []) : []),
    envJson: JSON.stringify(input.transport === 'stdio' ? (input.env ?? {}) : {}),
    url: input.transport === 'http' ? (input.url ?? null) : null,
    headersJson: JSON.stringify(input.transport === 'http' ? (input.headers ?? {}) : {}),
    presetId: input.presetId ?? null,
    now: now(),
  })
  return ucOk(projectMcpDTO(row))
}

export async function patchProjectMcp(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchProjectMcpInput,
): Promise<UseCaseResult<ProjectMcpDTO>> {
  const existing = await storage.getProjectMcpById(id)
  if (!existing) return notFound('project_mcp', id)
  if (input.name && input.name !== existing.name) {
    const dupe = await storage.getProjectMcpByName(existing.projectId, input.name)
    if (dupe && dupe.id !== id) {
      return conflict(`mcp name "${input.name}" already exists in this project`)
    }
  }
  const row = await storage.patchProjectMcp({
    id,
    patch: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.command !== undefined ? { command: input.command } : {}),
      ...(input.args !== undefined ? { argsJson: JSON.stringify(input.args) } : {}),
      ...(input.env !== undefined ? { envJson: JSON.stringify(input.env) } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.headers !== undefined ? { headersJson: JSON.stringify(input.headers) } : {}),
      ...(input.presetId !== undefined ? { presetId: input.presetId } : {}),
    },
    now: now(),
  })
  return ucOk(projectMcpDTO(row))
}

export async function deleteProjectMcp(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getProjectMcpById(id)
  if (!existing) return notFound('project_mcp', id)
  await storage.softDeleteProjectMcp(id, now())
  return ucOk({ ok: true })
}
