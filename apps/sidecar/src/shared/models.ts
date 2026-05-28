/**
 * Model routing for agent runs.
 *
 * Intent: spend Opus only where it pays off (planning / complex reasoning),
 * Sonnet for the bulk of implementation + reviews + unit tests, and Haiku for
 * cheap mechanical work (small tasks, final lightweight validation).
 *
 * The base model comes from the agent's `model:` frontmatter; this module can
 * downgrade it per-run based on the task at hand (e.g. a tiny senior-dev task
 * doesn't need Opus or even Sonnet).
 */

export const OPUS = 'claude-opus-4-7'
export const SONNET = 'claude-sonnet-4-6'
export const HAIKU = 'claude-haiku-4-5-20251001'

const KNOWN_MODELS = new Set([OPUS, SONNET, HAIKU])

const SMALL_TASK_MAX_MINUTES = 30

export interface ModelRoutingInput {
  /** Agent name (design-architect, senior-dev, qa-reviewer, …). */
  agentName: string
  /** The model declared in the agent's .md frontmatter, if any. */
  declaredModel?: string | null
  /** The task's estimate in minutes, if known. Used to spot tiny tasks. */
  taskEstimateMinutes?: number | null
  /** How many times this step has already been retried on this task (i.e.
   *  finished agent runs for the same stepKey before this one). 0 means the
   *  current run is the first attempt; 1+ means we're retrying. */
  retryCount?: number
}

/**
 * Resolve the model for a run.
 *
 * Rules (first match wins):
 *  - retryCount ≥ 1 on a non-Haiku agent → Opus (escalation: the default
 *    model already failed once, try the strongest available to break the loop).
 *  - `delivery-validator` → Haiku (light final checks).
 *  - `senior-dev` on a small task (≤30 min estimate) → Haiku.
 *  - `senior-dev` / `security-reviewer` → Sonnet (implementation / review).
 *  - otherwise: the agent's declared model if it's a known id, else Sonnet.
 *    (design-architect / pivot-architect / sales-rep declare Opus / Sonnet.)
 */
export function resolveModel({
  agentName,
  declaredModel,
  taskEstimateMinutes,
  retryCount,
}: ModelRoutingInput): string {
  const isSmallTask =
    typeof taskEstimateMinutes === 'number' &&
    taskEstimateMinutes > 0 &&
    taskEstimateMinutes <= SMALL_TASK_MAX_MINUTES

  // Escalation: once the previous attempt rejected the same step, push the
  // next attempt to the strongest model. delivery-validator stays on Haiku
  // (its job is mechanical) — every other role moves to Opus.
  if (typeof retryCount === 'number' && retryCount >= 1) {
    if (agentName === 'delivery-validator') return HAIKU
    return OPUS
  }

  if (agentName === 'delivery-validator') return HAIKU
  if (agentName === 'senior-dev') return isSmallTask ? HAIKU : SONNET
  if (agentName === 'security-reviewer') return SONNET
  if (agentName === 'qa-reviewer') return SONNET

  if (declaredModel && KNOWN_MODELS.has(declaredModel)) return declaredModel
  return SONNET
}
