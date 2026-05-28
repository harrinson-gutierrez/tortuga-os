/**
 * On Windows, `.cmd` and `.bat` files are not real executables — they need
 * cmd.exe to interpret them. Node's `spawn` with `shell: false` fails with
 * ENOENT because CreateProcess can't run a batch file directly.
 *
 * npm distributes shims for npx/npm/yarn/pnpm/etc. as `.cmd` files, so any MCP
 * connection that uses `npx -y some-package` would die on every spawn. We
 * detect those endings and ask Node to wrap the call in cmd.exe — args still
 * go through quoted, no manual escaping needed.
 *
 * On non-Windows platforms shell is never required for our use case.
 */
export function commandNeedsShell(command: string): boolean {
  if (process.platform !== 'win32') return false
  const lower = command.toLowerCase()
  return (
    lower.endsWith('.cmd') ||
    lower.endsWith('.bat') ||
    lower === 'npx' ||
    lower === 'npm' ||
    lower === 'yarn' ||
    lower === 'pnpm'
  )
}
