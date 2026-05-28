#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

const tauriConfPath = join(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json')
const bundleRoot = join(repoRoot, 'apps/desktop/src-tauri/target/release/bundle')

function die(msg) {
  console.error(`build-manifest: ${msg}`)
  process.exit(1)
}

if (!existsSync(tauriConfPath)) die(`tauri.conf.json not found at ${tauriConfPath}`)
const conf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'))
const version = conf.version
if (!version) die('tauri.conf.json has no `version`')

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.split('='))
    .filter((kv) => kv.length === 2),
)

const releaseUrlBase =
  args.urlBase ??
  process.env.TORTUGA_RELEASE_URL_BASE ??
  `https://github.com/harrinson-gutierrez/tortuga-os/releases/download/v${version}`

const notes = args.notes ?? process.env.TORTUGA_RELEASE_NOTES ?? `Release ${version}`
const pubDate = new Date().toISOString()

if (!existsSync(bundleRoot)) {
  die(`bundle dir not found: ${bundleRoot}\nRun \`pnpm tauri build\` first.`)
}

const PLATFORM_PATTERNS = [
  { key: 'windows-x86_64', regex: /^Tortuga.OS_.+_x64-setup\.exe$/, sub: 'nsis' },
  { key: 'windows-x86_64', regex: /^Tortuga.OS_.+_x64_en-US\.msi$/, sub: 'msi' },
  { key: 'darwin-x86_64', regex: /^Tortuga.OS_.+_x64\.dmg$/, sub: 'dmg' },
  { key: 'darwin-aarch64', regex: /^Tortuga.OS_.+_aarch64\.dmg$/, sub: 'dmg' },
  { key: 'linux-x86_64', regex: /^tortuga-os_.+_amd64\.AppImage$/, sub: 'appimage' },
]

function findFirstMatch(subDir, regex) {
  const dir = join(bundleRoot, subDir)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return null
  const entries = readdirSync(dir)
  return entries.find((f) => regex.test(f)) ?? null
}

const platforms = {}
for (const pat of PLATFORM_PATTERNS) {
  if (platforms[pat.key]) continue
  const file = findFirstMatch(pat.sub, pat.regex)
  if (!file) continue
  const sigPath = join(bundleRoot, pat.sub, `${file}.sig`)
  if (!existsSync(sigPath)) {
    console.warn(`build-manifest: skipping ${pat.key} — no .sig next to ${file}`)
    continue
  }
  const signature = readFileSync(sigPath, 'utf-8').trim()
  platforms[pat.key] = {
    signature,
    url: `${releaseUrlBase}/${file}`,
  }
}

if (Object.keys(platforms).length === 0) {
  die('no signed bundles found. Did you set TAURI_SIGNING_PRIVATE_KEY and run `pnpm tauri build`?')
}

const manifest = { version, notes, pub_date: pubDate, platforms }
const outPath =
  args.out ?? join(repoRoot, 'apps/desktop/src-tauri/target/release/bundle/latest.json')
writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8')

console.log(`✓ latest.json written: ${outPath}`)
console.log(`  version: ${version}`)
console.log(`  platforms: ${Object.keys(platforms).join(', ')}`)
console.log(`  urlBase: ${releaseUrlBase}`)
