import { readFileSync, writeFileSync } from 'node:fs'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface FidelityResult {
  diffPct: number
  diffImagePath: string
  width: number
  height: number
}

/** Default thresholds (configurable per project). Green < warn ≤ fail. */
export const DEFAULT_FIDELITY_WARN_PCT = 2
export const DEFAULT_FIDELITY_FAIL_PCT = 8

/** Per-pixel color-distance sensitivity handed to pixelmatch (0..1). */
const PIXELMATCH_THRESHOLD = 0.1

/**
 * Scale a PNG to a target width/height with nearest-neighbour sampling so
 * the baseline (Figma export) and the implemented screenshot can be diffed
 * even when their raw dimensions differ. Nearest-neighbour keeps it
 * dependency-free; the diff tolerates the resulting aliasing via the
 * pixelmatch threshold.
 */
function resize(src: PNG, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src
  const out = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(src.height - 1, Math.floor((y * src.height) / height))
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(src.width - 1, Math.floor((x * src.width) / width))
      const srcIdx = (src.width * srcY + srcX) << 2
      const dstIdx = (width * y + x) << 2
      out.data[dstIdx] = src.data[srcIdx] ?? 0
      out.data[dstIdx + 1] = src.data[srcIdx + 1] ?? 0
      out.data[dstIdx + 2] = src.data[srcIdx + 2] ?? 0
      out.data[dstIdx + 3] = src.data[srcIdx + 3] ?? 0
    }
  }
  return out
}

/**
 * Compare an implemented screenshot against the Figma baseline frame and
 * return the percentage of differing pixels plus a diff image written to
 * `diffImagePath`. Both inputs are resized to the baseline's dimensions so
 * device-density differences don't dominate the diff.
 */
export function compareFidelity(
  baselinePath: string,
  implementedPath: string,
  diffImagePath: string,
): FidelityResult {
  const baseline = PNG.sync.read(readFileSync(baselinePath))
  const implementedRaw = PNG.sync.read(readFileSync(implementedPath))
  const width = baseline.width
  const height = baseline.height
  const implemented = resize(implementedRaw, width, height)

  const diff = new PNG({ width, height })
  const mismatched = pixelmatch(baseline.data, implemented.data, diff.data, width, height, {
    threshold: PIXELMATCH_THRESHOLD,
  })
  writeFileSync(diffImagePath, PNG.sync.write(diff))

  const total = width * height
  const diffPct = total === 0 ? 100 : (mismatched / total) * 100
  return { diffPct, diffImagePath, width, height }
}

export type FidelityVerdict = 'passed' | 'warning' | 'failed'

/** Map a diff percentage onto the double-threshold verdict. */
export function fidelityVerdict(
  diffPct: number,
  warnPct = DEFAULT_FIDELITY_WARN_PCT,
  failPct = DEFAULT_FIDELITY_FAIL_PCT,
): FidelityVerdict {
  if (diffPct < warnPct) return 'passed'
  if (diffPct <= failPct) return 'warning'
  return 'failed'
}
