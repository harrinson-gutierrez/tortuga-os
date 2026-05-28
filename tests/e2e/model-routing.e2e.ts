// resolveModel picks the Claude model for a run from agent role + task size:
// Opus for planning, Sonnet for implementation/reviews, Haiku for tiny tasks
// and final validation. These pin the routing so a refactor can't quietly
// move everything onto Opus and blow the token budget.
import { describe, expect, it } from 'vitest'
import { HAIKU, OPUS, SONNET, resolveModel } from '../../apps/sidecar/src/shared/models'

describe('resolveModel', () => {
  it('delivery-validator → Haiku (light final checks)', () => {
    expect(resolveModel({ agentName: 'delivery-validator', declaredModel: OPUS })).toBe(HAIKU)
  })

  it('senior-dev → Sonnet on a normal task', () => {
    expect(
      resolveModel({ agentName: 'senior-dev', declaredModel: OPUS, taskEstimateMinutes: 240 }),
    ).toBe(SONNET)
  })

  it('senior-dev → Haiku on a tiny task (≤30 min)', () => {
    expect(
      resolveModel({ agentName: 'senior-dev', declaredModel: OPUS, taskEstimateMinutes: 20 }),
    ).toBe(HAIKU)
    expect(
      resolveModel({ agentName: 'senior-dev', declaredModel: OPUS, taskEstimateMinutes: 30 }),
    ).toBe(HAIKU)
    // Just over the threshold → back to Sonnet.
    expect(
      resolveModel({ agentName: 'senior-dev', declaredModel: OPUS, taskEstimateMinutes: 31 }),
    ).toBe(SONNET)
  })

  it('senior-dev with no estimate → Sonnet (not Haiku)', () => {
    expect(resolveModel({ agentName: 'senior-dev', declaredModel: OPUS })).toBe(SONNET)
    expect(
      resolveModel({ agentName: 'senior-dev', declaredModel: OPUS, taskEstimateMinutes: 0 }),
    ).toBe(SONNET)
    expect(
      resolveModel({ agentName: 'senior-dev', declaredModel: OPUS, taskEstimateMinutes: null }),
    ).toBe(SONNET)
  })

  it('qa-reviewer / security-reviewer → Sonnet', () => {
    expect(resolveModel({ agentName: 'qa-reviewer', declaredModel: OPUS })).toBe(SONNET)
    expect(resolveModel({ agentName: 'security-reviewer', declaredModel: OPUS })).toBe(SONNET)
  })

  it('design-architect / pivot-architect keep their declared Opus', () => {
    expect(resolveModel({ agentName: 'design-architect', declaredModel: OPUS })).toBe(OPUS)
    expect(resolveModel({ agentName: 'pivot-architect', declaredModel: OPUS })).toBe(OPUS)
  })

  it('sales-rep keeps its declared Sonnet', () => {
    expect(resolveModel({ agentName: 'sales-rep', declaredModel: SONNET })).toBe(SONNET)
  })

  it('unknown / missing declared model falls back to Sonnet', () => {
    expect(resolveModel({ agentName: 'design-architect', declaredModel: 'gpt-4' })).toBe(SONNET)
    expect(resolveModel({ agentName: 'design-architect', declaredModel: null })).toBe(SONNET)
    expect(resolveModel({ agentName: 'design-architect' })).toBe(SONNET)
  })
})
