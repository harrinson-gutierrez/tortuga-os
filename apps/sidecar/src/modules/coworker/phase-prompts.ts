import type { TaskCoworkerPhase } from '@tortuga-os/contracts'

/**
 * Per-phase instruction appended to each coworker turn. It steers the dev
 * agent's behavior for the current phase without changing its system prompt.
 * Gates and QA stay the authority for "done" — the coworker never runs them.
 */
export const PHASE_INSTRUCTIONS: Record<TaskCoworkerPhase, string> = {
  planning:
    'Estás en PLANEACIÓN. Propón el plan de implementación de esta pantalla/historia y PÁRATE a confirmar con el operador antes de continuar. No escribas código todavía.',
  construction:
    'Estás en CONSTRUCCIÓN. Implementa lo acordado editando los archivos del workspace. NO corras los gates ni los tests tú mismo. Termina tu turno con un resumen de qué archivos cambiaste y qué falta.',
  execution:
    'Estás en EJECUCIÓN. Continúa la implementación, itera sobre lo construido y ajusta lo que el operador pidió. NO corras los gates ni los tests. Termina con un resumen de los cambios y los pendientes.',
  validation:
    'Estás en VALIDACIÓN. NO edites archivos. Resume qué debe verificar el operador y qué gates deben correr para dar por buena la tarea.',
  delivery:
    'Estás en ENTREGA. NO edites archivos. Resume el resultado final de la tarea para que el operador lo apruebe.',
}
