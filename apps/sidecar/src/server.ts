import { createNodeWebSocket } from '@hono/node-ws'
import {
  bodyLimit,
  buildDomainRouter,
  corsMiddleware,
  makeErrorHandler,
  requireHandshake,
} from '@tortuga-os/api-server'
import { Hono } from 'hono'
import { agentRunsRouter } from './modules/agent-runs/routes'
import { coworkerRouter } from './modules/coworker/routes'
import { designRouter } from './modules/design/routes'
import { discoveryRouter } from './modules/discovery/routes'
import { gatesRunRouter } from './modules/gates/routes'
import { previewRouter } from './modules/preview/routes'
import { scrcpyStreamHandler } from './modules/preview/scrcpy-ws'
import { scaffoldRouter } from './modules/scaffold/routes'
import { skillsRouter } from './modules/skills/routes'
import { troubleshootRouter } from './modules/troubleshoot/routes'
import { workspaceRouter } from './modules/workspace/routes'
import { coreDeps } from './shared/core-deps'
import { loadHandshakeToken } from './shared/handshake'
import { logFilePath, logger } from './shared/logger'

export function buildApp() {
  const app = new Hono()
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app })

  app.use('/*', bodyLimit())

  const isDev = process.env.TORTUGA_DESKTOP_DEV === '1' || process.env.NODE_ENV !== 'production'

  app.use('/*', corsMiddleware({ isDev }))
  app.use('/*', requireHandshake({ expected: loadHandshakeToken() }))

  app.onError(
    makeErrorHandler({
      logError: (msg: string, meta: Record<string, unknown>) => logger.error(meta, msg),
    }),
  )

  app.get('/health', (c) =>
    c.json({ ok: true, name: 'tortuga-os-sidecar', ts: Date.now(), logFile: logFilePath }),
  )

  // Domain surface from api-server (all use-case-backed endpoints).
  app.route('/api', buildDomainRouter(coreDeps()))

  // Sidecar-only surfaces (workspace FS, scrcpy preview) stay in-app since
  // they depend on local OS resources, not on the core port.
  app.route('/api/workspace', workspaceRouter)
  app.route('/api/preview', previewRouter)
  app.get('/api/preview/devices/:serial/stream', scrcpyStreamHandler(upgradeWebSocket))
  // POST + cancel for agent runs live in the sidecar (they need workspace
  // resolution + prompt assembly); read GETs come from api-server.
  app.route('/api/agent-runs', agentRunsRouter)
  // Gate execution lives in the sidecar (spawns child processes + writes
  // logs into the project workspace). Read GETs come from api-server.
  app.route('/api/gates', gatesRunRouter)
  // Discovery chat with the sales/discovery agent (calls Anthropic SDK).
  app.route('/api/discovery', discoveryRouter)
  // Coworker mode: turn-based chat that drives a build task. Each turn queues
  // a real dev agent run in the workspace (so files persist) and polls it to
  // completion. Gates/QA stay the authority for "done".
  app.route('/api/coworker', coworkerRouter)
  // Deterministic project scaffolding from JSON templates (no LLM).
  app.route('/api/scaffold', scaffoldRouter)
  // Skill packs catalog + per-project enable/disable toggles. The pack
  // registry lives on disk in the bundle, not in SQL, so this is
  // sidecar-only.
  app.route('/api/skills', skillsRouter)
  // Runtime error troubleshooter: paste/hook/logcat errors → structured
  // diagnosis → apply fix → run integration test → operator confirm.
  app.route('/api/troubleshoot', troubleshootRouter)
  // F3 design: import a Figma file or generate one from intent. Both queue
  // a `designer` agent run that talks to the Figma MCP; the worker post-run
  // hook persists the resulting frames + baseline screenshots.
  app.route('/api/design', designRouter)

  if (process.env.TORTUGA_HANDSHAKE_TOKEN) {
    logger.info('Sidecar handshake: ENABLED (TORTUGA_HANDSHAKE_TOKEN is set)')
  } else {
    logger.warn(
      'Sidecar handshake: DISABLED (TORTUGA_HANDSHAKE_TOKEN not set). OK only for local dev.',
    )
  }
  if (isDev) {
    logger.info('CORS: development mode — localhost origins allowed')
  } else {
    logger.info('CORS: production mode — only tauri:// origins allowed')
  }

  return { app, injectWebSocket }
}
