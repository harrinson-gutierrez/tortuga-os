import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

declare const __dirname: string | undefined

export interface ManifestStep {
  id: string
  label: string
  type: 'bash'
  command: string
  args: string[]
  /** cwd relative to the workspace root. */
  cwd: string
}

export interface ManifestFile {
  /** Destination relative to the workspace root. */
  to: string
  /** Template path relative to the manifest dir. */
  fromTemplate: string
}

export interface ManifestVerify {
  id: string
  label: string
  command: string
  args: string[]
  cwd: string
}

export interface Manifest {
  stack: string
  displayName: string
  description: string
  steps: ManifestStep[]
  files: ManifestFile[]
  verify: ManifestVerify[]
}

// Resolve our own directory in a way that works for both:
//   - tsx --watch in dev (ESM, import.meta.url is defined)
//   - esbuild --format=cjs bundle in production (Tauri sidecar), where
//     import.meta is empty and __dirname is the Node CJS global.
function resolveHere(): string {
  const metaUrl = (import.meta as { url?: string }).url
  if (metaUrl) return dirname(fileURLToPath(metaUrl))
  if (typeof __dirname === 'string') return __dirname
  throw new Error(
    'manifest.ts: cannot resolve own directory (neither import.meta.url nor __dirname is available)',
  )
}

const here = resolveHere()

// `here` differs at runtime depending on how the sidecar is loaded:
//   - tsx --watch: apps/sidecar/src/modules/scaffold/   → ../../../templates/scaffolds
//   - bundled cjs: apps/sidecar/dist-bundle/            → ./templates/scaffolds
// Try both and pick whichever exists. Fail loudly with the list of tried
// paths so we don't end up in obscure ENOENT chains in production.
function findTemplatesRoot(): string {
  const candidates = [
    join(here, '..', '..', '..', 'templates', 'scaffolds'),
    join(here, 'templates', 'scaffolds'),
  ]
  for (const c of candidates) {
    try {
      readFileSync(join(c, '.exists'), 'utf-8')
      return c
    } catch {
      /* not here */
    }
    // Fallback existence check without requiring a marker file: try to stat
    // one common manifest path; if it works the dir is real.
    try {
      readFileSync(join(c, 'flutter-supabase', 'manifest.json'), 'utf-8')
      return c
    } catch {
      /* not here */
    }
  }
  throw new Error(`scaffold templates not found. Looked in: ${candidates.join(', ')}`)
}

const templatesRoot = findTemplatesRoot()

export function loadManifest(stack: string): Manifest {
  const path = join(templatesRoot, stack, 'manifest.json')
  const raw = readFileSync(path, 'utf-8')
  return JSON.parse(raw) as Manifest
}

export function templateDirFor(stack: string): string {
  return join(templatesRoot, stack)
}

export function readTemplate(stack: string, relPath: string): string {
  return readFileSync(join(templatesRoot, stack, relPath), 'utf-8')
}
