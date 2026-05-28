import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { WorkspaceNodeDTO, WorkspaceTreeDTO } from '@tortuga-os/contracts'

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-bundle',
  'build',
  'target',
  '.turbo',
  '.cache',
  '.next',
  'coverage',
  '.DS_Store',
])

const MAX_TREE_DEPTH = 6

function buildNode(absPath: string, rootAbs: string, depth: number): WorkspaceNodeDTO | null {
  const name = absPath.split(/[/\\]/).pop() ?? absPath
  if (IGNORED_NAMES.has(name)) return null
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(absPath)
  } catch {
    return null
  }
  const relPath = relative(rootAbs, absPath).split('\\').join('/')
  if (st.isDirectory()) {
    let children: WorkspaceNodeDTO[] = []
    if (depth < MAX_TREE_DEPTH) {
      let entries: string[] = []
      try {
        entries = readdirSync(absPath)
      } catch {
        entries = []
      }
      children = entries
        .map((e) => buildNode(join(absPath, e), rootAbs, depth + 1))
        .filter((n): n is WorkspaceNodeDTO => n !== null)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    }
    return { name, path: relPath || '.', type: 'dir', modifiedAt: st.mtimeMs, children }
  }
  return { name, path: relPath, type: 'file', sizeBytes: st.size, modifiedAt: st.mtimeMs }
}

export function buildWorkspaceTree(projectCode: string, root: string | null): WorkspaceTreeDTO {
  const attemptedPath = root ?? null
  if (!root || !existsSync(root)) {
    return { projectCode, root: null, attemptedPath, tree: [] }
  }
  let entries: string[] = []
  try {
    entries = readdirSync(root)
  } catch {
    entries = []
  }
  const tree = entries
    .map((e) => buildNode(join(root, e), root, 1))
    .filter((n): n is WorkspaceNodeDTO => n !== null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  return { projectCode, root, attemptedPath: root, tree }
}
