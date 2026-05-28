#!/usr/bin/env node
// Test rápido del MCP server por stdio.

import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cjsPath = resolve(__dirname, 'dist-bundle/mcp-server.cjs')

// Apuntar a la DB dev (sembrada con `pnpm seed`) para que las tools tengan
// datos. En uso real (Claude Code/Desktop) el MCP server lee la DB de
// %APPDATA%/Tortuga-OS que se va llenando conforme uses la app.
const devDataDir = resolve(__dirname, '../../data/dev')

const child = spawn('node', [cjsPath], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_ENV: 'production',
    TORTUGA_DATA_DIR: devDataDir,
  },
})

child.stderr.on('data', (chunk) => process.stderr.write(`[stderr] ${chunk}`))

let buffer = ''
const inflight = new Map()
let nextId = 1

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    inflight.set(id, { resolve, reject })
    const msg = `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`
    child.stdin.write(msg)
  })
}

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString('utf8')
  while (true) {
    const idx = buffer.indexOf('\n')
    if (idx === -1) break
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue
    try {
      const msg = JSON.parse(line)
      if (msg.id != null && inflight.has(msg.id)) {
        const { resolve, reject } = inflight.get(msg.id)
        inflight.delete(msg.id)
        if (msg.error) reject(new Error(JSON.stringify(msg.error)))
        else resolve(msg.result)
      }
    } catch (e) {
      console.error('Parse error:', line)
    }
  }
})

const failures = []
function check(label, ok, detail) {
  const tick = ok ? '✓' : '✗'
  console.log(`  ${tick} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(label)
}

async function run() {
  console.log('=== Tortuga MCP handshake test ===\n')

  const init = await send('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'tortuga-test', version: '0.1.0' },
  })
  check('initialize responde', !!init?.serverInfo, `name=${init?.serverInfo?.name}`)
  check('serverInfo.name = tortuga-os', init?.serverInfo?.name === 'tortuga-os')

  const list = await send('tools/list', {})
  const tools = list?.tools ?? []
  check('tools/list responde array', Array.isArray(tools), `count=${tools.length}`)
  check('expone 8 tools', tools.length === 8)
  const expectedNames = [
    'tortuga_list_projects',
    'tortuga_get_project_status',
    'tortuga_get_kanban_board',
    'tortuga_move_task',
    'tortuga_list_tasks',
    'tortuga_list_agents',
    'tortuga_get_agent',
    'tortuga_list_leads',
  ]
  for (const name of expectedNames) {
    check(
      `tool ${name}`,
      tools.some((t) => t.name === name),
    )
  }

  const callProjects = await send('tools/call', {
    name: 'tortuga_list_projects',
    arguments: {},
  })
  const text = callProjects?.content?.[0]?.text
  check('tools/call list_projects responde', !!text)
  let projects = []
  try {
    projects = JSON.parse(text)
  } catch {}
  check('parsea JSON con proyectos', Array.isArray(projects), `count=${projects.length}`)
  check(
    'incluye proyecto ACM',
    projects.some((p) => p.code === 'ACM'),
  )

  const callAgents = await send('tools/call', {
    name: 'tortuga_list_agents',
    arguments: {},
  })
  let agents = []
  try {
    agents = JSON.parse(callAgents?.content?.[0]?.text ?? '[]')
  } catch {}
  check('list_agents devuelve 6 agentes', agents.length === 6, `count=${agents.length}`)

  const callBoard = await send('tools/call', {
    name: 'tortuga_get_kanban_board',
    arguments: { project_code: 'ACM' },
  })
  let board = null
  try {
    board = JSON.parse(callBoard?.content?.[0]?.text ?? 'null')
  } catch {}
  check('get_kanban_board ACM tiene 7 columnas', board?.columns?.length === 7)
  const securityCol = board?.columns?.find((c) => c.status === 'security_ready')
  check('columna security_ready requiere firma', securityCol?.requiresHumanSignoff === true)

  const callBad = await send('tools/call', { name: 'no_existe', arguments: {} })
  check('tool inválido devuelve isError', callBad?.isError === true)

  console.log('')
  if (failures.length === 0) {
    console.log('🎉 todos los tests pasan')
    child.kill()
    process.exit(0)
  } else {
    console.error(`✗ fallaron ${failures.length}:`, failures)
    child.kill()
    process.exit(1)
  }
}

setTimeout(() => {
  console.error('Timeout')
  child.kill()
  process.exit(2)
}, 15000)

run().catch((err) => {
  console.error('Test failed:', err.message)
  child.kill()
  process.exit(1)
})
