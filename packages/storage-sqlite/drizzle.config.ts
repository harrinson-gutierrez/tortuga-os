import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  // SQLite path is resolved at runtime by the sidecar; for dev use a local file
  dbCredentials: { url: 'file:./tortuga.dev.db' },
  strict: true,
  verbose: true,
})
