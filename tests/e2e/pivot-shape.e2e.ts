// normalizePivotShape turns the many JSON shapes pivot-architect emits into
// the strict PivotProposalDTO — snake_case keys, alternate field names, task
// objects with `id` instead of `taskId`, extra keys it must ignore, etc.
import { describe, expect, it } from 'vitest'
import {
  extractJsonProposal,
  normalizePivotShape,
} from '../../apps/sidecar/src/modules/pivots/pivot-runner'

describe('normalizePivotShape', () => {
  it('maps the canonical camelCase shape verbatim', () => {
    const out = normalizePivotShape({
      fromStackSummary: 'React + Hono',
      toStackSummary: 'Flutter + Supabase',
      tasksToKill: [{ taskId: 't1', reason: 'backend gone' }],
      tasksToRewrite: [{ taskId: 't2', newTitle: 'Login Flutter', newEstimateHours: 8 }],
      tasksToCreate: [
        { title: 'Setup Supabase', kind: 'feature', tags: ['infra'], estimateHours: 4 },
      ],
      tasksToKeep: ['t3'],
      archiveDecision: 'archive',
      risksAndMitigations: ['lock-in → portable SQL migrations'],
      clientImpactNote: 'no new signature required',
    })
    expect(out.fromStackSummary).toBe('React + Hono')
    expect(out.tasksToKill).toEqual([{ taskId: 't1', reason: 'backend gone' }])
    expect(out.tasksToRewrite[0]!.newEstimateHours).toBe(8)
    expect(out.tasksToCreate[0]!.kind).toBe('feature')
    expect(out.tasksToKeep).toEqual(['t3'])
  })

  it('accepts snake_case + alternate keys + extra junk', () => {
    const out = normalizePivotShape({
      from_stack: 'RN/Expo',
      target_stack: 'Native Kotlin + Swift',
      tasks_to_remove: [{ id: 't1', why: 'not applicable' }],
      tasks_to_update: [
        { id: 't2', title: 'Build native pipeline', hours: 6, description: 'rewritten' },
      ],
      new_tasks: [{ name: 'Setup Xcode + Gradle', detail: 'native CI', hours: 5, type: 'feature' }],
      keep: [{ id: 't3' }, 't4'],
      repo_decision: 'delete',
      risks: [{ risk: 'native learning curve', mitigation: 'pair with a senior dev' }],
      client_impact: 're-quote timelines',
      fallback_if_conditions_fail: ['keep RN'], // unknown key — must be dropped
      foo: 123,
    })
    expect(out.fromStackSummary).toBe('RN/Expo')
    expect(out.toStackSummary).toBe('Native Kotlin + Swift')
    expect(out.tasksToKill).toEqual([{ taskId: 't1', reason: 'not applicable' }])
    expect(out.tasksToRewrite[0]).toMatchObject({
      taskId: 't2',
      newTitle: 'Build native pipeline',
      newEstimateHours: 6,
      newDescription: 'rewritten',
    })
    expect(out.tasksToCreate[0]).toMatchObject({
      title: 'Setup Xcode + Gradle',
      estimateHours: 5,
      kind: 'feature',
    })
    expect(out.tasksToKeep).toEqual(['t3', 't4'])
    expect(out.archiveDecision).toBe('delete')
    expect(out.risksAndMitigations).toEqual(['native learning curve → pair with a senior dev'])
    expect(out.clientImpactNote).toBe('re-quote timelines')
    expect((out as Record<string, unknown>).foo).toBeUndefined()
  })

  it('drops kill/rewrite entries without a taskId, and create entries without a title', () => {
    const out = normalizePivotShape({
      fromStackSummary: 'A',
      toStackSummary: 'B',
      tasksToKill: [{ reason: 'huh' }, { taskId: 't1', reason: 'ok' }],
      tasksToRewrite: [{ newTitle: 'orphan' }, { taskId: 't2', newTitle: 'good' }],
      tasksToCreate: [{ description: 'no title' }, { title: 'has title' }],
    })
    expect(out.tasksToKill).toEqual([{ taskId: 't1', reason: 'ok' }])
    expect(out.tasksToRewrite).toHaveLength(1)
    expect(out.tasksToRewrite[0]!.taskId).toBe('t2')
    expect(out.tasksToCreate).toHaveLength(1)
    expect(out.tasksToCreate[0]!.title).toBe('has title')
  })

  it('an empty or weird object yields a valid empty proposal', () => {
    expect(normalizePivotShape({})).toMatchObject({
      fromStackSummary: '',
      toStackSummary: '',
      tasksToKill: [],
      tasksToRewrite: [],
      tasksToCreate: [],
      tasksToKeep: [],
      archiveDecision: 'archive',
      risksAndMitigations: [],
      clientImpactNote: '',
    })
    expect(normalizePivotShape(null)).toMatchObject({ archiveDecision: 'archive' })
    expect(normalizePivotShape('nope')).toMatchObject({ archiveDecision: 'archive' })
  })

  it('clamps non-positive estimate hours to undefined', () => {
    const out = normalizePivotShape({
      fromStackSummary: 'A',
      toStackSummary: 'B',
      tasksToCreate: [
        { title: 'zero', estimateHours: 0 },
        { title: 'neg', estimateHours: -3 },
      ],
      tasksToRewrite: [{ taskId: 't1', newTitle: 'x', newEstimateHours: 0 }],
    })
    expect(out.tasksToCreate[0]!.estimateHours).toBeUndefined()
    expect(out.tasksToCreate[1]!.estimateHours).toBeUndefined()
    expect(out.tasksToRewrite[0]!.newEstimateHours).toBeUndefined()
  })
})

describe('extractJsonProposal', () => {
  // The plan as the agent wrote it (with a couple of invented extra keys).
  const planText = `Here is the pivot analysis.

\`\`\`json
{
  "fromStackSummary": "React Native + Expo",
  "toStackSummary": "Native: Kotlin (Android) + Swift (iOS)",
  "tasksToKill": [{ "taskId": "019e1936-f718-702b-aad8-2b04abb3af35", "reason": "Expo no longer applies" }],
  "tasksToRewrite": [{ "taskId": "t2", "newTitle": "Native pipeline", "newEstimateHours": 6 }],
  "tasksToCreate": [{ "title": "Setup Xcode + Gradle", "kind": "feature", "estimateHours": 5, "tags": ["infra"] }],
  "tasksToKeep": ["t3"],
  "archiveDecision": "archive",
  "risksAndMitigations": ["native learning curve → pair senior"],
  "clientImpactNote": "no new signature required",
  "deadline": "2026-05-18",
  "supersedes": ["019e19ba-d499-75b3-a580-14a380ddd8da"]
}
\`\`\``

  it('digs the plan out of a stream-json `result` event (ignoring CLI telemetry keys)', () => {
    // Realistic: one JSON object per line. The result event embeds planText in
    // its `result` string; the event object also carries session_id/usage/etc.
    const stdout = [
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'x' }),
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'thinking…' }] },
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: planText,
        session_id: 'e4bfe142',
        total_cost_usd: 1.07,
        usage: { input_tokens: 12, output_tokens: 22044 },
      }),
    ].join('\n')
    const out = extractJsonProposal(stdout)
    expect(out.fromStackSummary).toBe('React Native + Expo')
    expect(out.toStackSummary).toContain('Kotlin')
    expect(out.tasksToKill).toEqual([
      { taskId: '019e1936-f718-702b-aad8-2b04abb3af35', reason: 'Expo no longer applies' },
    ])
    expect(out.tasksToCreate[0]!.title).toBe('Setup Xcode + Gradle')
    // invented keys dropped
    expect((out as Record<string, unknown>).deadline).toBeUndefined()
    expect((out as Record<string, unknown>).supersedes).toBeUndefined()
  })

  it('also works when stdout is just the fenced plan (no stream-json wrapping)', () => {
    const out = extractJsonProposal(planText)
    expect(out.fromStackSummary).toBe('React Native + Expo')
    expect(out.archiveDecision).toBe('archive')
  })

  it('throws when there is no recognisable plan in the output', () => {
    const stdout = [
      JSON.stringify({ type: 'system', session_id: 'x' }),
      JSON.stringify({
        type: 'result',
        result: 'Could not generate the plan, missing data.',
        usage: {},
      }),
    ].join('\n')
    expect(() => extractJsonProposal(stdout)).toThrow()
  })
})
