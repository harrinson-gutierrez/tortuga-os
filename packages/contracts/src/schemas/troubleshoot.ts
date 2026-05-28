import { z } from 'zod'
import { TROUBLESHOOT_STATUSES } from '../enums'

/**
 * Structured diagnosis JSON the `troubleshooter` agent must emit at the
 * end of its run. The orchestrator parses this and uses it to apply the
 * fix, write the integration test, and (when needed) gate on operator
 * actions.
 */
export const ProposedFile = z.object({
  path: z.string().min(1),
  rationale: z.string().min(1),
  newContent: z.string(),
})
export type ProposedFile = z.infer<typeof ProposedFile>

export const ProposedSql = z.object({
  name: z.string().min(1),
  rationale: z.string().min(1),
  body: z.string().min(1),
})
export type ProposedSql = z.infer<typeof ProposedSql>

export const IntegrationTestSpec = z.object({
  path: z.string().min(1),
  body: z.string().min(1),
})
export type IntegrationTestSpec = z.infer<typeof IntegrationTestSpec>

export const RequiredOperatorAction = z.object({
  title: z.string().min(1),
  why: z.string().min(1),
  where: z.string().min(1),
  deepLink: z.string().url().optional(),
  verification: z.string().optional(),
  completedAt: z.number().int().nullable().default(null),
})
export type RequiredOperatorAction = z.infer<typeof RequiredOperatorAction>

export const TroubleshootDiagnosis = z.object({
  rootCause: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  proposedFiles: z.array(ProposedFile).default([]),
  proposedSql: z.array(ProposedSql).default([]),
  integrationTestDart: IntegrationTestSpec,
  requiredOperatorActions: z.array(RequiredOperatorAction).default([]),
  manualValidationSteps: z.array(z.string().min(1)).default([]),
})
export type TroubleshootDiagnosis = z.infer<typeof TroubleshootDiagnosis>

export const CreateTroubleshootInput = z.object({
  taskId: z.string().min(1),
  errorText: z.string().min(1),
  contextNote: z.string().optional(),
  /** Optional report this one supersedes (regression chain). */
  parentReportId: z.string().min(1).optional(),
  /** Base64 PNG of the before-screenshot. Stored to disk under workspace. */
  beforeScreenshotPngBase64: z.string().optional(),
})
export type CreateTroubleshootInput = z.infer<typeof CreateTroubleshootInput>

export const CreateBugfixInput = z.object({
  storyId: z.string().min(1),
  errorText: z.string().min(1),
  contextNote: z.string().optional(),
  beforeScreenshotPngBase64: z.string().optional(),
})
export type CreateBugfixInput = z.infer<typeof CreateBugfixInput>

export const CreateBugfixOutput = z.object({
  taskId: z.string(),
  reportId: z.string(),
})
export type CreateBugfixOutput = z.infer<typeof CreateBugfixOutput>

export const MarkActionDoneInput = z.object({
  actionIndex: z.number().int().min(0),
})
export type MarkActionDoneInput = z.infer<typeof MarkActionDoneInput>

export const ConfirmTroubleshootInput = z.object({
  afterScreenshotPngBase64: z.string().optional(),
})
export type ConfirmTroubleshootInput = z.infer<typeof ConfirmTroubleshootInput>

export const TroubleshootReportDTO = z.object({
  id: z.string(),
  taskId: z.string(),
  parentReportId: z.string().nullable(),
  status: z.enum(TROUBLESHOOT_STATUSES),
  errorText: z.string(),
  contextNote: z.string().nullable(),
  beforeScreenshotPath: z.string().nullable(),
  afterScreenshotPath: z.string().nullable(),
  lastDiagnosisRunId: z.string().nullable(),
  diagnosis: TroubleshootDiagnosis.nullable(),
  requiredActions: z.array(RequiredOperatorAction),
  attemptCount: z.number().int(),
  lastTestOutput: z.string().nullable(),
  resolvedAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
})
export type TroubleshootReportDTO = z.infer<typeof TroubleshootReportDTO>
