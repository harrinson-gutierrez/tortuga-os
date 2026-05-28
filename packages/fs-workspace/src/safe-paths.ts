import { resolve, sep } from 'node:path'
import { FsWorkspaceError } from './errors'

/**
 * Resolves `candidate` relative to `root` and verifies that the result falls
 * strictly under `root`. Throws on `..` traversal or absolute paths that point
 * outside `root`.
 */
export function safeResolveUnder(root: string, candidate: string): string {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new FsWorkspaceError('invalid_path', `invalid path: '${String(candidate)}'`)
  }
  const absRoot = resolve(root)
  const absResolved = resolve(absRoot, candidate)
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : absRoot + sep
  if (absResolved !== absRoot && !absResolved.startsWith(rootWithSep)) {
    throw new FsWorkspaceError('path_traversal', `path traversal blocked: '${candidate}'`)
  }
  return absResolved
}

export function safeResolveUnderAny(roots: string[], candidate: string): string {
  for (const root of roots) {
    try {
      return safeResolveUnder(root, candidate)
    } catch {
      // try the next one
    }
  }
  throw new FsWorkspaceError(
    'path_traversal',
    `path traversal blocked across all roots: '${candidate}'`,
  )
}
