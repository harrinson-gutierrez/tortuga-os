import { describe, expect, it } from 'vitest'
import {
  ACTIVE_AGENTS,
  DEFAULT_DESIGN_DOC_PIPELINE,
  DEFAULT_FEATURE_PIPELINE,
  LEGACY_FEATURE_PIPELINE,
  STEP_STATUSES,
  STEP_TYPES,
  STEP_TYPE_KEYS,
  agentForStep,
  gateKindForStep,
  isGateStep,
  taskWorkStatuses,
} from '../../packages/shared-types/src/enums'

describe('step catalog', () => {
  it('every step key has a complete definition in STEP_TYPES', () => {
    for (const key of STEP_TYPE_KEYS) {
      const def = STEP_TYPES[key]
      expect(def).toBeDefined()
      expect(def.agent).toBeTruthy()
      expect(def.verb).toBeTruthy()
      expect(def.outputDir).toBeTruthy()
    }
  })

  it('agentForStep returns the correct agent for each step key', () => {
    expect(agentForStep('design-spec')).toBe('product-designer')
    expect(agentForStep('architect-review')).toBe('solution-architect')
    expect(agentForStep('implement')).toBe('senior-dev')
    expect(agentForStep('figma-implement')).toBe('figma-implementer')
  })

  it('v2 collapses reviewer steps to objective gates (PLAN §4.2)', () => {
    expect(isGateStep('qa-test')).toBe(true)
    expect(isGateStep('runtime-smoke')).toBe(true)
    expect(isGateStep('security-review')).toBe(true)
    expect(isGateStep('deliver')).toBe(true)
    // Agent steps are NOT gates.
    expect(isGateStep('figma-implement')).toBe(false)
    expect(isGateStep('implement')).toBe(false)
    expect(gateKindForStep('security-review')).toBe('security')
    expect(gateKindForStep('deliver')).toBe('delivery')
    expect(gateKindForStep('qa-test')).toBe('code')
    expect(gateKindForStep('implement')).toBeNull()
  })

  it('ACTIVE_AGENTS is the 6-agent v2 set', () => {
    expect(ACTIVE_AGENTS).toHaveLength(6)
    expect(ACTIVE_AGENTS).toContain('product-designer')
    expect(ACTIVE_AGENTS).toContain('figma-implementer')
    expect(ACTIVE_AGENTS).toContain('senior-dev')
    expect(ACTIVE_AGENTS).toContain('solution-architect')
    expect(ACTIVE_AGENTS).toContain('sales-rep')
    expect(ACTIVE_AGENTS).toContain('scoping-architect')
  })

  it('DEFAULT_FEATURE_PIPELINE is design-first then gates (PLAN §4.1)', () => {
    expect(DEFAULT_FEATURE_PIPELINE).toEqual([
      'design-spec',
      'architect-review',
      'figma-implement',
      'implement',
      'security-review',
      'deliver',
    ])
  })

  it('LEGACY_FEATURE_PIPELINE skips architect-review (pre-v2 fallback)', () => {
    expect(LEGACY_FEATURE_PIPELINE).not.toContain('architect-review')
    expect(LEGACY_FEATURE_PIPELINE[0]).toBe('write-design-doc')
    expect(LEGACY_FEATURE_PIPELINE.at(-1)).toBe('deliver')
  })

  it('DEFAULT_DESIGN_DOC_PIPELINE uses qa-doc-check and excludes implement/deliver', () => {
    expect(DEFAULT_DESIGN_DOC_PIPELINE).toContain('qa-doc-check')
    expect(DEFAULT_DESIGN_DOC_PIPELINE).not.toContain('qa-test')
    expect(DEFAULT_DESIGN_DOC_PIPELINE).not.toContain('implement')
    expect(DEFAULT_DESIGN_DOC_PIPELINE).not.toContain('deliver')
    expect(DEFAULT_DESIGN_DOC_PIPELINE).toHaveLength(3)
  })

  it('every step in every pipeline is a valid STEP_TYPE_KEY', () => {
    const allSteps = [
      ...DEFAULT_FEATURE_PIPELINE,
      ...LEGACY_FEATURE_PIPELINE,
      ...DEFAULT_DESIGN_DOC_PIPELINE,
    ]
    for (const key of allSteps) {
      expect(STEP_TYPE_KEYS as readonly string[]).toContain(key)
    }
  })

  it('STEP_STATUSES includes all 6 lifecycle values', () => {
    expect(STEP_STATUSES).toContain('pending')
    expect(STEP_STATUSES).toContain('running')
    expect(STEP_STATUSES).toContain('done')
    expect(STEP_STATUSES).toContain('rejected')
    expect(STEP_STATUSES).toContain('skipped')
    expect(STEP_STATUSES).toContain('needs_input')
    expect(STEP_STATUSES).toHaveLength(6)
  })

  it('taskWorkStatuses has the 4 pipeline-aware task statuses', () => {
    expect(taskWorkStatuses).toHaveLength(4)
    expect(taskWorkStatuses).toContain('backlog')
    expect(taskWorkStatuses).toContain('in_progress')
    expect(taskWorkStatuses).toContain('blocked')
    expect(taskWorkStatuses).toContain('done')
  })
})
