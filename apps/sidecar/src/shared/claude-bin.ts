import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface ResolvedClaudeBin {
  command: string
  useShell: boolean
}

let cached: ResolvedClaudeBin | null = null

function findInPath(targets: string[]): string | null {
  const pathEnv = process.env.PATH ?? process.env.Path ?? ''
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    for (const target of targets) {
      const candidate = join(dir, target)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function resolveClaudeBinUncached(): ResolvedClaudeBin {
  if (process.platform !== 'win32') {
    return { command: 'claude', useShell: false }
  }

  const npmAppData = process.env.APPDATA
    ? join(
        process.env.APPDATA,
        'npm',
        'node_modules',
        '@anthropic-ai',
        'claude-code',
        'bin',
        'claude.exe',
      )
    : null
  if (npmAppData && existsSync(npmAppData)) {
    return { command: npmAppData, useShell: false }
  }

  const fromPath = findInPath(['claude.exe'])
  if (fromPath) {
    return { command: fromPath, useShell: false }
  }

  const cmdShim = findInPath(['claude.cmd'])
  if (cmdShim) {
    return { command: cmdShim, useShell: true }
  }

  return { command: 'claude', useShell: true }
}

export function resolveClaudeBin(): ResolvedClaudeBin {
  if (!cached) cached = resolveClaudeBinUncached()
  return cached
}
