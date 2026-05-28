import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svgPath = resolve(root, 'assets/brand/tortuga-mark-v2.svg')
const tauriIcons = resolve(root, 'apps/desktop/src-tauri/icons')

const targets = [
  ['Square30x30Logo.png', 30],
  ['Square44x44Logo.png', 44],
  ['Square71x71Logo.png', 71],
  ['Square89x89Logo.png', 89],
  ['Square107x107Logo.png', 107],
  ['Square142x142Logo.png', 142],
  ['Square150x150Logo.png', 150],
  ['Square284x284Logo.png', 284],
  ['Square310x310Logo.png', 310],
  ['StoreLogo.png', 50],
]

const svg = await readFile(svgPath)
for (const [name, size] of targets) {
  const out = resolve(tauriIcons, name)
  const buf = await sharp(svg, { density: Math.max(size * 4, 512) })
    .resize(size, size)
    .png()
    .toBuffer()
  await writeFile(out, buf)
  console.log(`Wrote ${out} (${size}x${size})`)
}
