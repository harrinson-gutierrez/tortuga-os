import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

export default defineConfig({
  // Set root explicitly: vitest resolves `include` relative to root, and
  // absolute paths with spaces (Windows) break tinyglobby's internal globs.
  root: repoRoot,
  test: {
    // Forks (not threads) — the native better-sqlite3 is not thread-safe in the
    // pattern vitest uses with worker_threads. Forks isolate the singleton DB per file.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
    globals: false,
    testTimeout: 5000,
    hookTimeout: 10000,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/e2e/**/*.e2e.ts', 'tests/flows/**/*.flow.e2e.ts'],
    reporters: ['default'],
    env: {
      NODE_ENV: 'test',
    },
    // better-sqlite3 is a native addon (.node). Vitest/Vite must not bundle it.
    server: {
      deps: {
        external: ['better-sqlite3', 'drizzle-orm'],
      },
    },
  },
  resolve: {
    alias: {
      '@tortuga-os/storage-sqlite': resolve(repoRoot, 'packages/storage-sqlite/src'),
      '@tortuga-os/contracts': resolve(repoRoot, 'packages/contracts/src'),
    },
  },
})
