import type {
  CreateProjectInput,
  PatchProjectInput,
  ProjectDTO,
  ProjectWithClientDTO,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, conflict, notFound, ucOk } from '../errors'
import { projectDTO, projectWithClientDTO } from '../mappers'

export async function listProjects({
  storage,
}: CoreDeps): Promise<UseCaseResult<ProjectWithClientDTO[]>> {
  const rows = await storage.listProjectsWithClient()
  return ucOk(rows.map((r) => projectWithClientDTO(r.project, r.client)))
}

export async function getProjectByCode(
  { storage }: CoreDeps,
  code: string,
): Promise<UseCaseResult<ProjectWithClientDTO>> {
  const row = await storage.getProjectByCode(code)
  if (!row) return notFound('project', code)
  return ucOk(projectWithClientDTO(row.project, row.client))
}

export async function getProjectById(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<ProjectDTO>> {
  const row = await storage.getProjectById(id)
  if (!row) return notFound('project', id)
  return ucOk(projectDTO(row))
}

export async function createProject(
  { storage, newId }: CoreDeps,
  input: CreateProjectInput,
): Promise<UseCaseResult<ProjectDTO>> {
  const client = await storage.getClientById(input.clientId)
  if (!client) return notFound('client', input.clientId)

  const existing = await storage.getProjectByCode(input.code)
  if (existing) return conflict(`project code ${input.code} already exists`)

  const projectId = newId()
  const salesPhaseId = newId()
  const firstQuoteId = newId()
  const project = await storage.createProjectWithSalesPhase({
    id: projectId,
    code: input.code,
    clientId: input.clientId,
    name: input.name,
    description: input.description ?? null,
    currency: input.currency,
    salesPhaseId,
    firstQuoteId,
    now: Date.now(),
  })
  return ucOk(projectDTO(project))
}

export async function patchProject(
  { storage, now }: CoreDeps,
  id: string,
  input: PatchProjectInput,
): Promise<UseCaseResult<ProjectDTO>> {
  const existing = await storage.getProjectById(id)
  if (!existing) return notFound('project', id)
  const row = await storage.patchProject(
    id,
    {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.workspacePath !== undefined ? { workspacePath: input.workspacePath } : {}),
    },
    now(),
  )
  return ucOk(projectDTO(row))
}

export async function deleteProject(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getProjectById(id)
  if (!existing) return notFound('project', id)
  await storage.softDeleteProject(id, now())
  return ucOk({ ok: true })
}
