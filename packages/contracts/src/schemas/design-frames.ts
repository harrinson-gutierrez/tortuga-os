import { DESIGN_FRAME_STATUSES } from '@tortuga-os/domain'
import { z } from 'zod'

export const DesignFrameStatus = z.enum(DESIGN_FRAME_STATUSES)
export type DesignFrameStatus = z.infer<typeof DesignFrameStatus>

/**
 * Design tokens extracted from a Figma frame. Free-form record so the
 * designer agent can surface whatever the design system exposes
 * (colors, typography ramps, spacing scale, radii). Persisted as JSON.
 */
export const DesignTokens = z.object({
  colors: z.record(z.string(), z.string()).optional(),
  typography: z.record(z.string(), z.string()).optional(),
  spacing: z.record(z.string(), z.number()).optional(),
  radii: z.record(z.string(), z.number()).optional(),
})
export type DesignTokens = z.infer<typeof DesignTokens>

export const CreateDesignFrameInput = z.object({
  storyId: z.string().min(1),
  figmaFileKey: z.string().min(1),
  figmaNodeId: z.string().min(1),
  name: z.string().min(1).max(200),
  tokens: DesignTokens.optional(),
  baselineScreenshotPath: z.string().nullable().optional(),
  status: DesignFrameStatus.optional(),
})
export type CreateDesignFrameInput = z.infer<typeof CreateDesignFrameInput>

export const PatchDesignFrameInput = z.object({
  name: z.string().min(1).max(200).optional(),
  tokens: DesignTokens.optional(),
  baselineScreenshotPath: z.string().nullable().optional(),
  status: DesignFrameStatus.optional(),
  fidelityPct: z.number().min(0).max(100).nullable().optional(),
})
export type PatchDesignFrameInput = z.infer<typeof PatchDesignFrameInput>

/** Operator pastes a Figma link; the sidecar imports its frames. */
export const ImportDesignInput = z.object({
  storyId: z.string().min(1),
  figmaUrl: z.string().url(),
})
export type ImportDesignInput = z.infer<typeof ImportDesignInput>

/** Operator describes intent; the designer agent generates a Figma design. */
export const GenerateDesignInput = z.object({
  storyId: z.string().min(1),
  intent: z.string().min(1).max(4000),
})
export type GenerateDesignInput = z.infer<typeof GenerateDesignInput>

/**
 * Structured output the `designer` agent must emit at the end of its run:
 * one entry per Figma frame it imported or generated. The sidecar post-run
 * hook parses this and persists each entry as a design_frame row, decoding
 * `screenshotBase64` into the baseline PNG used by the G5 fidelity gate.
 */
export const DesignerFrameOutput = z.object({
  figmaFileKey: z.string().min(1),
  figmaNodeId: z.string().min(1),
  name: z.string().min(1).max(200),
  tokens: DesignTokens.default({}),
  /** Base64 PNG export of the frame, used as the fidelity baseline. */
  screenshotBase64: z.string().optional(),
})
export type DesignerFrameOutput = z.infer<typeof DesignerFrameOutput>

export const DesignerOutput = z.object({
  mode: z.enum(['import', 'generate']),
  frames: z.array(DesignerFrameOutput).min(1),
})
export type DesignerOutput = z.infer<typeof DesignerOutput>
