import { existsSync, readFileSync, statSync } from 'node:fs'
import type { WorkspaceFileDTO } from '@tortuga-os/contracts'
import { FsWorkspaceError } from './errors'
import { safeResolveUnder } from './safe-paths'

const TEXT_EXTENSIONS = new Set([
  'md',
  'txt',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'html',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'sh',
  'bash',
  'sql',
  'rs',
  'go',
  'py',
  'java',
  'kt',
  'rb',
  'php',
  'svg',
  'csv',
  'log',
  'gitignore',
  'editorconfig',
  'lock',
  'cjs',
  'mjs',
])

const MAX_TEXT_FILE_BYTES = 512 * 1024
const MAX_RAW_BYTES = 25 * 1024 * 1024

export function readWorkspaceFile(root: string, relPath: string): WorkspaceFileDTO {
  if (!existsSync(root)) {
    throw new FsWorkspaceError('not_found', `workspace root '${root}' does not exist`)
  }
  const abs = safeResolveUnder(root, relPath)
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(abs)
  } catch {
    throw new FsWorkspaceError('not_found', `file '${relPath}'`)
  }
  if (st.isDirectory()) {
    throw new FsWorkspaceError('is_directory', `${relPath} is a directory, not a file`)
  }

  const ext = (relPath.split('.').pop() ?? '').toLowerCase()
  const isText = TEXT_EXTENSIONS.has(ext) || st.size === 0
  if (!isText) {
    return { path: relPath, sizeBytes: st.size, content: '', binary: true, truncated: false }
  }
  const buf = readFileSync(abs)
  const truncated = buf.length > MAX_TEXT_FILE_BYTES
  const content = (truncated ? buf.subarray(0, MAX_TEXT_FILE_BYTES) : buf).toString('utf-8')
  return { path: relPath, sizeBytes: st.size, content, binary: false, truncated }
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
}

export interface WorkspaceRawFile {
  buffer: Buffer
  mime: string
  sizeBytes: number
  fileName: string
}

export function readWorkspaceFileRaw(root: string, relPath: string): WorkspaceRawFile {
  if (!existsSync(root)) {
    throw new FsWorkspaceError('not_found', `workspace root '${root}' does not exist`)
  }
  const abs = safeResolveUnder(root, relPath)
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(abs)
  } catch {
    throw new FsWorkspaceError('not_found', `file '${relPath}'`)
  }
  if (st.isDirectory()) {
    throw new FsWorkspaceError('is_directory', `${relPath} is a directory, not a file`)
  }
  if (st.size > MAX_RAW_BYTES) {
    throw new FsWorkspaceError(
      'too_large',
      `file too large to serve (${st.size} bytes, max ${MAX_RAW_BYTES})`,
    )
  }
  const ext = (relPath.split('.').pop() ?? '').toLowerCase()
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  const fileName = relPath.split('/').pop() ?? relPath
  return { buffer: readFileSync(abs), mime, sizeBytes: st.size, fileName }
}
