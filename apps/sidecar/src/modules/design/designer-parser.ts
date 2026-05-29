import { type DesignerOutput, DesignerOutput as DesignerOutputSchema } from '@tortuga-os/contracts'

export type ParseDesignerResult =
  | { ok: true; output: DesignerOutput }
  | { ok: false; reason: string }

const FENCED_BLOCK = /```(?:json|JSON|jsonc)?\s*([\s\S]*?)```/g

/**
 * Extract the last fenced ```json block from a designer run's output and
 * validate it against the DesignerOutput schema. Same "prefer the last
 * block" strategy as the troubleshooter parser, since the system prompt
 * instructs the agent to emit exactly one JSON block at the end.
 */
export function parseDesignerOutput(output: string): ParseDesignerResult {
  if (!output || output.trim() === '') {
    return { ok: false, reason: 'agent output is empty' }
  }
  const candidates: string[] = []
  for (const match of output.matchAll(FENCED_BLOCK)) {
    if (match[1]) candidates.push(match[1])
  }
  if (candidates.length === 0) {
    return { ok: false, reason: 'no fenced JSON block found in designer output' }
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const body = candidates[i]!.trim()
    if (!body) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(body)
    } catch {
      continue
    }
    const validated = DesignerOutputSchema.safeParse(parsed)
    if (validated.success) {
      return { ok: true, output: validated.data }
    }
  }
  return {
    ok: false,
    reason: 'fenced JSON block(s) present but none matched DesignerOutput schema',
  }
}
