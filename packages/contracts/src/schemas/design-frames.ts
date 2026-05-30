import { DESIGN_FRAME_STATUSES } from '@tortuga-os/domain'
import { z } from 'zod'

export const DesignFrameStatus = z.enum(DESIGN_FRAME_STATUSES)
export type DesignFrameStatus = z.infer<typeof DesignFrameStatus>

/**
 * Full design spec extracted from a Figma frame. The designer agent fills
 * whatever the Figma MCP exposes (get_variable_defs + get_design_context):
 * colors, gradients, typography, shadows/effects, borders, radii, spacing,
 * layout, and the raw design-system variables. Every field is optional and
 * arrays default to empty so the agent's output never fails validation for
 * a missing section. Persisted as JSON in tokens_json.
 */
export const ColorToken = z.object({
  name: z.string().optional(),
  hex: z.string(),
  opacity: z.number().min(0).max(1).optional(),
})

export const GradientStop = z.object({ color: z.string(), position: z.number().min(0).max(1) })
export const GradientToken = z.object({
  name: z.string().optional(),
  type: z.enum(['linear', 'radial', 'angular', 'diamond']).default('linear'),
  stops: z.array(GradientStop).default([]),
})

export const TypographyToken = z.object({
  name: z.string().optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().optional(),
  fontWeight: z.union([z.number(), z.string()]).optional(),
  lineHeight: z.union([z.number(), z.string()]).optional(),
  letterSpacing: z.union([z.number(), z.string()]).optional(),
})

export const ShadowToken = z.object({
  name: z.string().optional(),
  type: z.enum(['drop', 'inner']).default('drop'),
  x: z.number().default(0),
  y: z.number().default(0),
  blur: z.number().default(0),
  spread: z.number().default(0),
  color: z.string(),
})

export const BorderToken = z.object({
  name: z.string().optional(),
  width: z.number(),
  color: z.string(),
  style: z.enum(['solid', 'dashed', 'dotted']).optional(),
})

export const LayoutSpec = z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  autoLayout: z
    .object({
      direction: z.enum(['horizontal', 'vertical']).optional(),
      gap: z.number().optional(),
      padding: z.union([z.number(), z.array(z.number())]).optional(),
    })
    .optional(),
})

export const DesignTokens = z.object({
  /** Raw design-system variables/styles from get_variable_defs. */
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  colors: z.array(ColorToken).default([]),
  gradients: z.array(GradientToken).default([]),
  typography: z.array(TypographyToken).default([]),
  shadows: z.array(ShadowToken).default([]),
  borders: z.array(BorderToken).default([]),
  radii: z.record(z.string(), z.number()).optional(),
  spacing: z.record(z.string(), z.number()).optional(),
  layout: LayoutSpec.optional(),
})
export type DesignTokens = z.infer<typeof DesignTokens>

export const CreateDesignFrameInput = z.object({
  projectId: z.string().min(1),
  storyId: z.string().min(1).nullable().optional(),
  figmaFileKey: z.string().min(1),
  figmaNodeId: z.string().min(1),
  name: z.string().min(1).max(200),
  tokens: DesignTokens.optional(),
  baselineScreenshotPath: z.string().nullable().optional(),
  status: DesignFrameStatus.optional(),
})
export type CreateDesignFrameInput = z.infer<typeof CreateDesignFrameInput>

export const PatchDesignFrameInput = z.object({
  storyId: z.string().min(1).nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  tokens: DesignTokens.optional(),
  baselineScreenshotPath: z.string().nullable().optional(),
  status: DesignFrameStatus.optional(),
  fidelityPct: z.number().min(0).max(100).nullable().optional(),
})
export type PatchDesignFrameInput = z.infer<typeof PatchDesignFrameInput>

/** Operator pastes a Figma link; the sidecar imports the whole project design. */
export const ImportDesignInput = z.object({
  projectCode: z.string().min(1),
  figmaUrl: z.string().url(),
})
export type ImportDesignInput = z.infer<typeof ImportDesignInput>

/**
 * Generate the project design. The screens come from the project's build
 * stories (loaded server-side); `intent` is optional extra context the
 * operator can add (branding notes, tone) and may be empty.
 */
export const GenerateDesignInput = z.object({
  projectCode: z.string().min(1),
  intent: z.string().max(4000).optional(),
})
export type GenerateDesignInput = z.infer<typeof GenerateDesignInput>

/**
 * Structured output the `designer` agent must emit at the end of its run:
 * one entry per Figma frame it imported or generated. The sidecar post-run
 * hook parses this and persists each entry as a design_frame row, copying the
 * PNG at `screenshotPath` into the baseline used by the G5 fidelity gate.
 *
 * The screenshot travels as a workspace-relative PATH, never inline base64:
 * the agent curls each frame's PNG (the Figma MCP returns a short-lived URL)
 * straight to disk, so the output JSON stays in KB. Embedding 9 base64 PNGs
 * in one block produced a multi-MB payload the model hung emitting.
 */
export const DesignerFrameOutput = z.object({
  figmaFileKey: z.string().min(1),
  figmaNodeId: z.string().min(1),
  name: z.string().min(1).max(200),
  tokens: DesignTokens.default({}),
  /** Workspace-relative path to the PNG the agent saved (fidelity baseline). */
  screenshotPath: z.string().optional(),
})
export type DesignerFrameOutput = z.infer<typeof DesignerFrameOutput>

export const DesignerOutput = z.object({
  mode: z.enum(['import', 'generate']),
  frames: z.array(DesignerFrameOutput).min(1),
})
export type DesignerOutput = z.infer<typeof DesignerOutput>

/** Output of the frame-assigner agent: frame → build story assignments. */
export const FrameAssignerOutput = z.object({
  assignments: z.array(
    z.object({
      frameId: z.string().min(1),
      storyId: z.string().min(1),
      reason: z.string().optional(),
    }),
  ),
})
export type FrameAssignerOutput = z.infer<typeof FrameAssignerOutput>
