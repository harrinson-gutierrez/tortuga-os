import { serve } from '@hono/node-server'
import { startAgentRunWorker, stopAgentRunWorker } from './modules/agent-runs/worker'
import { buildApp } from './server'
import { initDb } from './shared/db'
import { assertRequiredEnv, env } from './shared/env'
import { logger } from './shared/logger'

/** Transient socket teardown errors that must never crash the sidecar. The
 *  scrcpy control/video sockets get torn down by the peer (emulator stops, the
 *  webview closes the stream) and a late write throws EPIPE/ECONNRESET from a
 *  Tango consumer that is detached from any awaited promise — so it surfaces as
 *  an uncaught exception. A dropped preview stream must never take the server
 *  down with it. */
function isTransientSocketError(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  const code = e?.code ?? ''
  const msg = e?.message ?? ''
  return (
    code === 'EPIPE' ||
    code === 'ECONNRESET' ||
    code === 'ERR_STREAM_WRITE_AFTER_END' ||
    /socket has been ended|write after end|EPIPE|ECONNRESET/i.test(msg)
  )
}

function installProcessGuards() {
  process.on('uncaughtException', (err) => {
    if (isTransientSocketError(err)) {
      logger.warn(
        { err: (err as Error).message },
        'Ignored transient socket error (stream teardown)',
      )
      return
    }
    logger.fatal({ err }, 'Uncaught exception — exiting')
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    if (isTransientSocketError(reason)) {
      logger.warn(
        { reason: (reason as Error)?.message ?? String(reason) },
        'Ignored transient socket rejection (stream teardown)',
      )
      return
    }
    logger.error({ reason }, 'Unhandled promise rejection')
  })
}

async function main() {
  logger.info({ pid: process.pid, dataDir: env.dataDir }, 'Starting Tortuga OS sidecar')
  installProcessGuards()

  const check = assertRequiredEnv()
  for (const w of check.warnings) logger.warn(w)
  if (!check.ok) {
    for (const e of check.errors) logger.fatal(e)
    logger.fatal('Refusing to start. Fix the environment and relaunch.')
    process.exit(1)
  }

  await initDb()
  startAgentRunWorker()

  const { app, injectWebSocket } = buildApp()
  const server = serve(
    {
      fetch: app.fetch,
      port: env.port, // 0 → OS-assigned random port
      hostname: '127.0.0.1',
    },
    (info) => {
      // onListen callback: invoked AFTER the actual listen, so `info.port`
      // already holds the effective port (resolves PORT=0).
      // Historical bug: calling `server.address()` right after `serve()`
      // returned null because the listen is async — the Rust shell never read
      // the port from stdout and the frontend fell back to 31415.
      // Machine-readable line for Tauri to parse:
      console.log(`TORTUGA_SIDECAR_PORT=${info.port}`)
      logger.info({ port: info.port, address: info.address }, 'Sidecar listening')
    },
  )
  // Attach the WebSocket upgrade handler to the Node server (scrcpy stream).
  injectWebSocket(server)

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down sidecar')
    stopAgentRunWorker()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.fatal({ err }, 'Sidecar crashed')
  process.exit(1)
})
