import { TroubleshootDiagnosis } from '@tortuga-os/contracts'

export type ParseResult =
  | { ok: true; diagnosis: TroubleshootDiagnosis }
  | { ok: false; reason: string }

/**
 * Extract the last fenced ```json … ``` block from the agent's output and
 * validate it against the TroubleshootDiagnosis schema.
 *
 * Why "last": the system prompt instructs the agent to emit EXACTLY one
 * JSON block at the END of the message. If the model gets chatty and
 * also includes example JSON earlier, we still want the authoritative
 * one. We prefer the last match.
 *
 * Also tolerates the common variations:
 *   - The fence labeled ```JSON or ```jsonc.
 *   - No language tag at all (``` ... ```) when the agent forgot to add
 *     it. We try to JSON.parse() the candidate body in that case.
 */
const FENCED_BLOCK = /```(?:json|JSON|jsonc)?\s*([\s\S]*?)```/g

export function parseDiagnosisFromOutput(output: string): ParseResult {
  if (!output || output.trim() === '') {
    return { ok: false, reason: 'agent output is empty' }
  }
  const candidates: string[] = []
  for (const match of output.matchAll(FENCED_BLOCK)) {
    if (match[1]) candidates.push(match[1])
  }
  if (candidates.length === 0) {
    return { ok: false, reason: 'no fenced JSON block found in agent output' }
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
    const validated = TroubleshootDiagnosis.safeParse(parsed)
    if (validated.success) {
      return { ok: true, diagnosis: validated.data }
    }
  }
  return {
    ok: false,
    reason: 'fenced JSON block(s) present but none matched TroubleshootDiagnosis schema',
  }
}
