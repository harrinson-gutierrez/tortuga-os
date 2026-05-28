import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svgPath = resolve(root, 'assets/brand/tortuga-mark-v2.svg')
const outDir = resolve(root, 'assets/brand/generated')
const outPng = resolve(outDir, 'tortuga-mark-v2-1024.png')

await mkdir(outDir, { recursive: true })
const svg = await readFile(svgPath)
const png = await sharp(svg, { density: 1024 }).resize(1024, 1024).png().toBuffer()
await writeFile(outPng, png)
console.log(`Wrote ${outPng}`)

const sizes = [16, 32, 64, 128, 256, 512, 1024]
for (const s of sizes) {
  const out = resolve(outDir, `tortuga-mark-v2-${s}.png`)
  const buf = await sharp(svg, { density: Math.max(s * 2, 256) })
    .resize(s, s)
    .png()
    .toBuffer()
  await writeFile(out, buf)
  console.log(`Wrote ${out}`)
}
