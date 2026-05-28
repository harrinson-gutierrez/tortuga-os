/**
 * One-shot: regenerate a 256x256 grain texture tile with sharp.
 * Produces a transparent-base PNG with 3% noise — the dominant intent is
 * that DsHeroCard composites it via multiply blend over the hero gradient
 * to break the flat 2010 gradient look.
 *
 * Usage:
 *   pnpm --filter @tortuga/sidecar exec tsx \
 *     src/scripts/generate-grain-png.ts <output-path>
 *
 * The output is small (~3-6 KB) and tiled by the consumer.
 */
import { writeFileSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import sharp from 'sharp'

async function main() {
  const out = process.argv[2]
  if (!out) {
    console.error('Usage: tsx generate-grain-png.ts <output-path>')
    process.exit(2)
  }
  const target = resolve(out)
  mkdirSync(dirname(target), { recursive: true })

  const size = 256
  const channels = 4
  const buf = Buffer.alloc(size * size * channels)
  // Fill with grayscale noise at 3% alpha. Each pixel:
  //   R = G = B = random grayscale in [40, 215]
  //   A = ~7 (≈ 3% of 255) so a tiled multiply blend reads as gentle grain
  for (let i = 0; i < size * size; i++) {
    const v = 40 + Math.floor(Math.random() * 176)
    buf[i * 4 + 0] = v
    buf[i * 4 + 1] = v
    buf[i * 4 + 2] = v
    buf[i * 4 + 3] = 7
  }

  const png = await sharp(buf, { raw: { width: size, height: size, channels } })
    .png({ compressionLevel: 9 })
    .toBuffer()

  writeFileSync(target, png)
  console.log(`✓ Wrote ${target} (${png.length} bytes, 256x256 grain @ 3% alpha)`)
  process.exit(0)
}

main().catch((err) => {
  console.error('generate-grain-png failed:', err.message ?? err)
  process.exit(1)
})
