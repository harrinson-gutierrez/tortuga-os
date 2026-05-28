import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
const outDir = join(__dirname, 'dist-bundle')

// Incremental mode (`--cjs-only`): recompile just the .cjs entrypoints in place,
// without wiping dist-bundle. Used by the auto-rebuild hook while Tauri is
// running — a full clean would EPERM on the loaded better_sqlite3.node (Windows
// locks native addons in use). The native addon + resources don't change on a
// TS edit, so skipping them is safe.
// `--dev`: pick the safe mode automatically for `tauri dev`. If a previous full
// bundle exists (the native addon + resources are in place), do an incremental
// rebuild so a still-running sidecar's locked better_sqlite3.node never EPERMs
// the clean. On a fresh checkout (no bundle yet) fall back to a full build.
const devMode = process.argv.includes('--dev')
// A bundle counts as complete only when every resource the incremental mode
// skips is already present: the native addon AND the drizzle migrations. A
// half-populated bundle (only .cjs) must trigger a full build, or the sidecar
// crashes at runtime with "Can't find meta/_journal.json file".
const bundleComplete =
  existsSync(join(outDir, 'sidecar.cjs')) &&
  existsSync(join(outDir, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')) &&
  existsSync(join(outDir, 'migrations/meta/_journal.json'))

// Even when the bundle is complete, migrations may be stale: drizzle-kit
// generated new files in `packages/storage-sqlite/migrations/` that the
// last cjs-only rebuild never recopied. Detect that and force the
// migration recopy step below (we don't need a full rebuild for it).
function countMigrationFiles(dir) {
  if (!existsSync(dir)) return -1
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.sql')).length
  } catch {
    return -1
  }
}
const migrationsSrcDir = join(root, 'packages/storage-sqlite/migrations')
const migrationsDstDir = join(outDir, 'migrations')
const migrationsStale =
  countMigrationFiles(migrationsSrcDir) !== countMigrationFiles(migrationsDstDir)

const cjsOnly = process.argv.includes('--cjs-only') || (devMode && bundleComplete)

// Limpiar (solo en build completo)
if (!cjsOnly) {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true })
  mkdirSync(outDir, { recursive: true })
}

// Bundle común: mismo target, mismas externals.
//
// IMPORTANTE: NO hardcodear `process.env.NODE_ENV` con `define`. El sidecar
// LEE esta variable en runtime para decidir CORS strict vs laxo (ver
// `src/server.ts` y `src/shared/env.ts`). Si esbuild la reemplaza a build
// time por la string literal `"production"`, el shell Rust no puede
// cambiar el comportamiento en debug builds. Se deja al runtime resolverla
// desde el environment que el shell inyecta.
const commonBuildOpts = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // better-sqlite3: native addon, copied separately.
  // @yume-chan/scrcpy-decoder-tinyh264: a browser-only H.264 decoder pulled in
  // transitively by @yume-chan/adb-scrcpy. The sidecar never decodes video (it
  // forwards raw packets to the webview), and the package does
  // `new Worker(new URL("./worker.js", ...))`, which esbuild cannot bundle into
  // a single .cjs. Externalizing it keeps the bundle runnable; it is never
  // require()d at runtime on the server.
  external: ['better-sqlite3', '@yume-chan/scrcpy-decoder-tinyh264'],
  minify: false,
  sourcemap: 'inline',
  logLevel: 'info',
}

// 1) Sidecar HTTP (Hono server)
await build({
  ...commonBuildOpts,
  entryPoints: [join(__dirname, 'src/main.ts')],
  outfile: join(outDir, 'sidecar.cjs'),
})

// 2) MCP server (stdio)
await build({
  ...commonBuildOpts,
  entryPoints: [join(__dirname, 'src/mcp/server.ts')],
  outfile: join(outDir, 'mcp-server.cjs'),
})

// Incremental mode stops here: the native addon + resources are already in
// dist-bundle from the last full build and don't change on a source edit.
if (cjsOnly) {
  // BUT: migrations CAN change between rebuilds (drizzle-kit generated new
  // files). If we skip the copy a stale set lives in the bundle and the
  // runtime migrate() silently no-ops the new tables. Recopy when stale.
  if (migrationsStale) {
    mkdirSync(migrationsDstDir, { recursive: true })
    mkdirSync(join(migrationsDstDir, 'meta'), { recursive: true })
    let copied = 0
    for (const f of readdirSync(migrationsSrcDir)) {
      const srcPath = join(migrationsSrcDir, f)
      try {
        // Skip directories at this level (meta/ handled below).
        if (!f.endsWith('.sql')) continue
        copyFileSync(srcPath, join(migrationsDstDir, f))
        copied += 1
      } catch {
        /* ignored */
      }
    }
    for (const f of readdirSync(join(migrationsSrcDir, 'meta'))) {
      copyFileSync(join(migrationsSrcDir, 'meta', f), join(migrationsDstDir, 'meta', f))
    }
    console.log(`✓ migrations resynced (${copied} .sql files + meta/)`)
  }
  console.log('✓ cjs-only rebuild: sidecar.cjs + mcp-server.cjs refreshed')
  process.exit(0)
}

// Copiar el binding nativo de better-sqlite3 junto al bundle.
// Ruta del paquete dentro del store de pnpm.
const bsRoot = join(root, 'node_modules/.pnpm/better-sqlite3@11.10.0/node_modules/better-sqlite3')
if (!existsSync(bsRoot)) {
  console.error(`No encuentro better-sqlite3 en ${bsRoot}`)
  process.exit(1)
}

// Copiar better-sqlite3 entero (build/Release + lib/ + package.json)
const targetBs = join(outDir, 'node_modules/better-sqlite3')
mkdirSync(targetBs, { recursive: true })
copyFileSync(join(bsRoot, 'package.json'), join(targetBs, 'package.json'))
cpSync(join(bsRoot, 'lib'), join(targetBs, 'lib'), { recursive: true })
cpSync(join(bsRoot, 'build/Release'), join(targetBs, 'build/Release'), {
  recursive: true,
})

// Copiar las dependencias requeridas por better-sqlite3 en runtime:
// 'bindings' resuelve el .node binding, y depende de 'file-uri-to-path'.
function copyPnpmPkg(name) {
  const pnpmDir = join(root, 'node_modules/.pnpm')
  const candidates = readdirSync(pnpmDir).filter((d) => d.startsWith(`${name}@`))
  if (candidates.length === 0) {
    console.error(`No encuentro ${name} en pnpm store`)
    process.exit(1)
  }
  const src = join(pnpmDir, candidates[0], 'node_modules', name)
  const dst = join(outDir, 'node_modules', name)
  cpSync(src, dst, { recursive: true })
}
copyPnpmPkg('bindings')
copyPnpmPkg('file-uri-to-path')

// Copiar migraciones drizzle. Lo hacemos explícito (archivo a archivo) en vez
// de un solo `cpSync` recursivo: si una sub-copia falla, queremos que el build
// reviente con un mensaje claro — no que el bundle quede sin `meta/_journal.json`
// y crashee silenciosamente en runtime con "Can't find meta/_journal.json file".
const migrationsSrc = join(root, 'packages/storage-sqlite/migrations')
const migrationsDst = join(outDir, 'migrations')
mkdirSync(migrationsDst, { recursive: true })
mkdirSync(join(migrationsDst, 'meta'), { recursive: true })
let migrationFiles = 0
for (const f of readdirSync(migrationsSrc)) {
  const srcPath = join(migrationsSrc, f)
  if (f === 'meta') continue
  if (!f.endsWith('.sql')) continue
  copyFileSync(srcPath, join(migrationsDst, f))
  migrationFiles += 1
}
for (const f of readdirSync(join(migrationsSrc, 'meta'))) {
  copyFileSync(join(migrationsSrc, 'meta', f), join(migrationsDst, 'meta', f))
}
if (!existsSync(join(migrationsDst, 'meta/_journal.json'))) {
  console.error('build.mjs: migrations/meta/_journal.json missing after copy — aborting')
  process.exit(1)
}
if (migrationFiles === 0) {
  console.error('build.mjs: no .sql migrations copied — aborting')
  process.exit(1)
}

// Copiar packages/agents/*.md como resource (paquete legacy, opcional).
const agentsSrc = join(root, 'packages/agents')
const agentsDst = join(outDir, 'agents')
if (existsSync(agentsSrc)) {
  mkdirSync(agentsDst, { recursive: true })
  for (const f of readdirSync(agentsSrc)) {
    if (f.endsWith('.md')) {
      copyFileSync(join(agentsSrc, f), join(agentsDst, f))
    }
  }
}

// Copiar templates/scaffolds/ — el sidecar lee manifest.json + plantillas
// desde aquí en runtime. Sin esto, scaffold/manifest.ts crashea con ENOENT.
const templatesSrc = join(root, 'apps/sidecar/templates')
const templatesDst = join(outDir, 'templates')
if (existsSync(templatesSrc)) {
  cpSync(templatesSrc, templatesDst, { recursive: true })
}

// Copiar skills bundled del producto como resource (recursivo).
const skillsSrc = join(root, 'apps/sidecar/skills-bundled')
const skillsDst = join(outDir, 'skills')
let skillCount = 0
if (existsSync(skillsSrc)) {
  cpSync(skillsSrc, skillsDst, { recursive: true })
  skillCount = readdirSync(skillsSrc, { withFileTypes: true }).filter((d) => d.isDirectory()).length
}

// Copiar el scrcpy-server (binario emparejado con AdbScrcpyOptions3_3_1).
const scrcpyServerName = 'scrcpy-server-v3.3.1'
const scrcpyServerSrc = join(root, 'apps/sidecar/resources', scrcpyServerName)
let scrcpyCopied = false
if (existsSync(scrcpyServerSrc)) {
  copyFileSync(scrcpyServerSrc, join(outDir, scrcpyServerName))
  scrcpyCopied = true
} else {
  console.warn(
    `build.mjs: ${scrcpyServerName} not found — interactive emulator stream will be disabled in the bundle`,
  )
}

console.log('\n✓ bundles ready in', outDir)
console.log('  - sidecar.cjs        (HTTP API: pnpm build:run)')
console.log('  - mcp-server.cjs     (stdio MCP: pnpm build:mcp:run)')
console.log('  - node_modules/better-sqlite3/')
console.log(`  - migrations/        (${migrationFiles} sql files + meta/_journal.json)`)
console.log('  - agents/')
console.log(`  - skills/            (${skillCount} skill packs)`)
if (scrcpyCopied) console.log(`  - ${scrcpyServerName}`)
