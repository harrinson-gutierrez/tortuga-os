import type { TaskCoworkerPhase } from '@tortuga-os/contracts'

const ORDER: TaskCoworkerPhase[] = [
  'planning',
  'construction',
  'execution',
  'validation',
  'delivery',
]

/** Next phase in the coworker flow, or null when already at the last one. */
export function nextPhase(phase: TaskCoworkerPhase): TaskCoworkerPhase | null {
  const idx = ORDER.indexOf(phase)
  if (idx < 0 || idx >= ORDER.length - 1) return null
  return ORDER[idx + 1] ?? null
}
