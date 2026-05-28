import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  type WorkspaceRawFile,
  buildWorkspaceTree,
  workspacePathFor as pathForImpl,
  readWorkspaceFile as readFileImpl,
  readWorkspaceFileRaw as readFileRawImpl,
  scaffoldWorkspace as scaffoldImpl,
} from '@tortuga-os/fs-workspace'
import { projects } from '@tortuga-os/storage-sqlite'
import { and, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../shared/db'
import { env } from '../../shared/env'
import { NotFoundError } from '../../shared/errors'
import { logger } from '../../shared/logger'

export type { WorkspaceRawFile }

export function workspacesRoot(): string {
  return join(env.dataDir, 'workspaces')
}

export function workspacePathFor(projectCode: string): string {
  return pathForImpl(workspacesRoot(), projectCode)
}

export function scaffoldWorkspace(projectCode: string, rootOverride?: string | null): string {
  const root = rootOverride?.trim() ? rootOverride : workspacePathFor(projectCode)
  const out = scaffoldImpl(root, projectCode)
  logger.info({ projectCode, root: out }, 'Workspace scaffolded')
  return out
}

async function loadProject(projectCode: string) {
  const proj = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.code, projectCode), isNull(projects.deletedAt)))
    .get()
  if (!proj) throw new NotFoundError(`Project ${projectCode}`)
  return proj
}

export async function ensureWorkspaceForProject(projectCode: string): Promise<string> {
  const proj = await loadProject(projectCode)
  const root = scaffoldWorkspace(proj.code)
  if (!proj.workspacePath) {
    await getDb()
      .update(projects)
      .set({ workspacePath: root, updatedAt: Date.now() })
      .where(eq(projects.id, proj.id))
  }
  return proj.workspacePath ?? root
}

export async function getWorkspaceTree(projectCode: string) {
  const proj = await loadProject(projectCode)
  const path = proj.workspacePath ?? workspacePathFor(proj.code)
  return buildWorkspaceTree(proj.code, path)
}

export async function readWorkspaceFile(projectCode: string, relPath: string) {
  const proj = await loadProject(projectCode)
  if (!proj.workspacePath || !existsSync(proj.workspacePath)) {
    throw new NotFoundError(`Workspace for project ${projectCode}`)
  }
  return readFileImpl(proj.workspacePath, relPath)
}

export async function readWorkspaceFileRaw(projectCode: string, relPath: string) {
  const proj = await loadProject(projectCode)
  if (!proj.workspacePath || !existsSync(proj.workspacePath)) {
    throw new NotFoundError(`Workspace for project ${projectCode}`)
  }
  return readFileRawImpl(proj.workspacePath, relPath)
}
