import { resolve, sep } from 'node:path'
import { PathTraversalError } from './errors'

/**
 * Resolves `candidate` relative to `root` and verifies that the result falls
 * strictly under `root`. If `candidate` contains `..` or is absolute and points
 * outside the root (e.g. `/etc/passwd` on Linux, `C:\Windows` on Windows),
 * throws `PathTraversalError`.
 *
 * Returns the resolved absolute path that is safe to read/write.
 *
 * Designed for inputs coming from the user (frontend, MCP) that will be used as
 * a path in `fs.readFile`/`fs.writeFile`. It does not replace OS ACLs, but it
 * blocks the typical `?path=../../../etc/passwd` case.
 */
export function safeResolveUnder(root: string, candidate: string): string {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new PathTraversalError(String(candidate))
  }
  const absRoot = resolve(root)
  const absResolved = resolve(absRoot, candidate)
  // Normalize with the OS separator to avoid a `/foo/..\bar`-style bypass.
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : absRoot + sep
  if (absResolved !== absRoot && !absResolved.startsWith(rootWithSep)) {
    throw new PathTraversalError(candidate)
  }
  return absResolved
}

/**
 * Variant that accepts multiple allowed roots (allowlist).
 * Returns the first root under which `candidate` resolves, or throws.
 */
export function safeResolveUnderAny(roots: string[], candidate: string): string {
  for (const root of roots) {
    try {
      return safeResolveUnder(root, candidate)
    } catch {
      // try the next one
    }
  }
  throw new PathTraversalError(candidate)
}
