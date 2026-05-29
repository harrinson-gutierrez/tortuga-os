import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CoreDeps } from '@tortuga-os/core'
import { logger } from '../../shared/logger'
import { captureScreenshot, listAdbDevices } from '../preview/device'
import {
  DEFAULT_FIDELITY_FAIL_PCT,
  DEFAULT_FIDELITY_WARN_PCT,
  compareFidelity,
  fidelityVerdict,
} from './fidelity'

export interface FidelityStepResult {
  verdict: 'passed' | 'warning' | 'failed' | 'skipped'
  diffPct: number | null
  diffImageRel: string | null
  frameId: string | null
  reason?: string
}

/**
 * The Figma-fidelity half of G5: capture the implemented screen on a live
 * device and pixel-diff it against the story's approved Figma baseline.
 *
 * "Device manda": this is the authoritative fidelity check. The golden
 * host (alchemist) still runs as the fast pre-check via the normal G5
 * command; this step can only DOWNGRADE the gate (warning/failed), never
 * upgrade it. Skipped (non-blocking) when there is no device or no
 * baseline frame — same posture as G4_BOOT without a device.
 */
export async function runFidelityForStory(
  deps: CoreDeps,
  args: {
    storyId: string
    workspace: string
    taskCode: string
    iterationN: number
  },
): Promise<FidelityStepResult> {
  const frames = await deps.storage.listDesignFramesForStory(args.storyId)
  const baselineFrame = frames.find((f) => f.baselineScreenshotPath)
  if (!baselineFrame || !baselineFrame.baselineScreenshotPath) {
    return {
      verdict: 'skipped',
      diffPct: null,
      diffImageRel: null,
      frameId: null,
      reason: 'no Figma baseline frame for this story — import a design first',
    }
  }

  const devices = await listAdbDevices()
  const device = devices[0]
  if (!device) {
    return {
      verdict: 'skipped',
      diffPct: null,
      diffImageRel: null,
      frameId: baselineFrame.id,
      reason: 'no device connected — fidelity check needs a live emulator',
    }
  }

  const gateDir = join(args.workspace, '05-build', '_gates', args.taskCode, `n${args.iterationN}`)
  mkdirSync(gateDir, { recursive: true })
  const implementedAbs = join(gateDir, 'G5_implemented.png')
  const diffAbs = join(gateDir, 'G5_diff.png')
  const diffRel = `05-build/_gates/${args.taskCode}/n${args.iterationN}/G5_diff.png`

  let png: Buffer
  try {
    png = await captureScreenshot(device.serial)
  } catch (err) {
    return {
      verdict: 'skipped',
      diffPct: null,
      diffImageRel: null,
      frameId: baselineFrame.id,
      reason: `device screenshot failed: ${(err as Error).message}`,
    }
  }
  writeFileSync(implementedAbs, png)

  const baselineAbs = join(args.workspace, baselineFrame.baselineScreenshotPath)
  let diffPct: number
  try {
    const result = compareFidelity(baselineAbs, implementedAbs, diffAbs)
    diffPct = result.diffPct
  } catch (err) {
    return {
      verdict: 'skipped',
      diffPct: null,
      diffImageRel: null,
      frameId: baselineFrame.id,
      reason: `pixel diff failed: ${(err as Error).message}`,
    }
  }

  const verdict = fidelityVerdict(diffPct, DEFAULT_FIDELITY_WARN_PCT, DEFAULT_FIDELITY_FAIL_PCT)
  await deps.storage.patchDesignFrame({
    id: baselineFrame.id,
    patch: { fidelityPct: Math.round(diffPct) },
    now: deps.now(),
  })
  logger.info(
    { storyId: args.storyId, frameId: baselineFrame.id, diffPct, verdict },
    'gate G5: figma fidelity computed',
  )

  return { verdict, diffPct, diffImageRel: diffRel, frameId: baselineFrame.id }
}
