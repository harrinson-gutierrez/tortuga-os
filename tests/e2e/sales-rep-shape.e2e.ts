// normalizeShape is the defensive layer that flattens the many JSON shapes
// sales-rep emits into the strict proposal schema. These cover the shapes
// seen in the wild — especially a top-level `tasks[]` array, which used to
// fall through and mark the run failed even though the JSON was fine.
import { describe, expect, it } from 'vitest'
import {
  SalesRepGenerationSchema,
  normalizeShape,
} from '../../apps/sidecar/src/modules/proposals/sales-rep-runner'

describe('sales-rep normalizeShape', () => {
  it('flattens a top-level tasks[] array into modules and keeps the declared total', () => {
    const payload = {
      client: 'TORTUGA OS',
      type: 'commercial',
      currency: 'USD',
      summary: 'PDF reader',
      hourlyRateCents: 5000,
      totalHours: 224,
      totalCents: 1_120_000,
      members: [],
      tasks: [
        { name: 'Setup', description: 'x', hours: 16, rateCents: 5000, amountCents: 80_000 },
        { name: 'Render', description: 'y', hours: 32, rateCents: 5000, amountCents: 160_000 },
      ],
    }
    const out = normalizeShape(payload)
    expect(Array.isArray(out.modules)).toBe(true)
    expect((out.modules as unknown[]).length).toBe(2)
    // declared totalCents wins, not the sum of per-task amounts
    expect(out.totalAmountCents).toBe(1_120_000)
    expect(out.contractedHours).toBe(224)
    const parsed = SalesRepGenerationSchema.safeParse(out)
    expect(parsed.success).toBe(true)
  })

  it('falls back to Σ amountCents when no total is declared', () => {
    const out = normalizeShape({
      currency: 'USD',
      summary: 's',
      members: [],
      items: [
        { label: 'A', hours: 10, amountCents: 50_000 },
        { label: 'B', hours: 10, amountCents: 70_000 },
      ],
    })
    expect(out.totalAmountCents).toBe(120_000)
    expect((out.modules as unknown[]).length).toBe(2)
  })

  it('clamps zero/negative module hours to 1 so the schema accepts it', () => {
    const out = normalizeShape({
      currency: 'USD',
      summary: 's',
      totalCents: 10_000,
      members: [],
      tasks: [{ name: 'Trivial', hours: 0 }],
    })
    const mods = out.modules as Array<{ estimateHours: number }>
    expect(mods[0]!.estimateHours).toBeGreaterThanOrEqual(1)
    expect(SalesRepGenerationSchema.safeParse(out).success).toBe(true)
  })

  it('still handles phases[].tasks[] (nested) → modules', () => {
    const out = normalizeShape({
      currency: 'USD',
      summary: 's',
      totalCents: 100_000,
      members: [],
      phases: [
        {
          name: 'Phase 1',
          tasks: [
            { name: 'a', hours: 8 },
            { name: 'b', hours: 4 },
          ],
        },
        { name: 'Phase 2', tasks: [{ name: 'c', hours: 12 }] },
      ],
    })
    const mods = out.modules as Array<{ label: string; estimateHours: number; description: string }>
    expect(mods.length).toBe(2)
    expect(mods[0]!.estimateHours).toBe(12)
    expect(mods[0]!.description).toContain('a (8h)')
    expect(SalesRepGenerationSchema.safeParse(out).success).toBe(true)
  })

  it('autogenerates milestones when missing and they sum to the total', () => {
    const out = normalizeShape({
      currency: 'USD',
      summary: 's',
      totalCents: 1_000_000,
      members: [],
      tasks: [{ name: 'x', hours: 40 }],
    })
    const ms = out.milestones as Array<{ amountCents: number }>
    expect(ms.length).toBeGreaterThanOrEqual(1)
    const sum = ms.reduce((a, m) => a + m.amountCents, 0)
    expect(sum).toBe(1_000_000)
    expect(SalesRepGenerationSchema.safeParse(out).success).toBe(true)
  })
})
