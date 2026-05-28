/**
 * Story validation rules (STORY-FORMAT.md).
 *
 * F1_SALES cannot close until every Story validates. This function is the
 * gate: it returns the list of issues for a story; an empty list means
 * the story is valid.
 */

import type { GateType, Role } from '../values'
import { ROLES } from '../values'

export interface StoryDraft {
  id: string
  title: string
  goal: string
  ownerRole: Role
  acceptanceCriteria: ReadonlyArray<{ id: string; given: string; when: string; then: string }>
  estimatedHoursByRole: Readonly<Partial<Record<Role, number>>>
  inputs: {
    design?: { figmaFileKey?: string; figmaNodeIds?: ReadonlyArray<string> }
    apiContract?: string
  }
  outputs: {
    files?: ReadonlyArray<string>
    endpoints?: ReadonlyArray<string>
    evidence: ReadonlyArray<{ type: string; description: string }>
  }
  verification: {
    gates: ReadonlyArray<GateType>
    manualChecks: ReadonlyArray<string>
  }
  outOfScope: ReadonlyArray<string>
}

export interface StoryIssue {
  code: StoryIssueCode
  field: string
  message: string
}

export type StoryIssueCode =
  | 'id_format'
  | 'title_too_long'
  | 'title_not_imperative'
  | 'no_hours_estimated'
  | 'design_required_for_ui'
  | 'outputs_files_required'
  | 'evidence_required'
  | 'acceptance_criteria_empty'
  | 'acceptance_criterion_incomplete'
  | 'verification_gates_empty'
  | 'out_of_scope_undeclared'

const ID_RE = /^[A-Z][A-Z0-9_-]*-\d{3,}$/

export function validateStory(draft: StoryDraft): StoryIssue[] {
  const issues: StoryIssue[] = []

  if (!ID_RE.test(draft.id)) {
    issues.push({
      code: 'id_format',
      field: 'id',
      message: 'id must match <PROJECT_CODE>-NNN (e.g. GASTUU-014)',
    })
  }

  if (draft.title.length > 80) {
    issues.push({
      code: 'title_too_long',
      field: 'title',
      message: `title is ${draft.title.length} chars; max 80`,
    })
  }

  const hoursSum = Object.values(draft.estimatedHoursByRole).reduce<number>(
    (s, h) => s + (h ?? 0),
    0,
  )
  if (hoursSum <= 0) {
    issues.push({
      code: 'no_hours_estimated',
      field: 'estimatedHoursByRole',
      message: 'at least one role must have estimated_hours > 0',
    })
  }

  const isUiOwner = draft.ownerRole === 'designer' || draft.ownerRole === 'dev'
  if (isUiOwner) {
    const hasFigma =
      !!draft.inputs.design?.figmaFileKey && !!draft.inputs.design.figmaNodeIds?.length
    if (!hasFigma) {
      issues.push({
        code: 'design_required_for_ui',
        field: 'inputs.design',
        message: `${draft.ownerRole}-owned stories require Figma file key + at least one node id`,
      })
    }
  }

  if (draft.ownerRole === 'dev' && (!draft.outputs.files || draft.outputs.files.length === 0)) {
    issues.push({
      code: 'outputs_files_required',
      field: 'outputs.files',
      message: 'dev-owned stories must declare at least one output file',
    })
  }

  if (!draft.outputs.evidence || draft.outputs.evidence.length === 0) {
    issues.push({
      code: 'evidence_required',
      field: 'outputs.evidence',
      message: 'every story must declare at least one evidence artifact',
    })
  }

  if (draft.acceptanceCriteria.length === 0) {
    issues.push({
      code: 'acceptance_criteria_empty',
      field: 'acceptanceCriteria',
      message: 'at least one acceptance criterion is required',
    })
  } else {
    for (const ac of draft.acceptanceCriteria) {
      if (!ac.given.trim() || !ac.when.trim() || !ac.then.trim()) {
        issues.push({
          code: 'acceptance_criterion_incomplete',
          field: `acceptanceCriteria.${ac.id}`,
          message: 'given/when/then must all be non-empty',
        })
      }
    }
  }

  if (!draft.verification.gates || draft.verification.gates.length === 0) {
    issues.push({
      code: 'verification_gates_empty',
      field: 'verification.gates',
      message: 'verification.gates must be a non-empty list',
    })
  }

  if (!Array.isArray(draft.outOfScope)) {
    issues.push({
      code: 'out_of_scope_undeclared',
      field: 'outOfScope',
      message: 'outOfScope must be declared (can be an empty array)',
    })
  }

  return issues
}

export function isStoryValid(draft: StoryDraft): boolean {
  return validateStory(draft).length === 0
}

export const VALID_OWNER_ROLES: ReadonlyArray<Role> = ROLES
