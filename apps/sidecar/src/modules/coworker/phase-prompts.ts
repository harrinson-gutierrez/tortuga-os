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

/**
 * Appended to every coworker turn. Lets the agent ASK the operator a decision
 * instead of guessing: it ends its turn with a fenced JSON block the chat turns
 * into clickable buttons. AskUserQuestion (which would block the headless
 * process) stays disabled — this is its turn-based replacement.
 */
export const COWORKER_QUESTION_PROTOCOL = [
  '## Cuando necesites una decisión del operador',
  'NO uses AskUserQuestion (está deshabilitado). En su lugar, cuando debas',
  'elegir entre opciones y no sea obvio, TERMINA tu turno con un único bloque',
  '```json al final con esta forma EXACTA y NADA después:',
  '```json',
  '{ "coworkerQuestion": { "question": "¿…?", "options": ["Opción A", "Opción B"] } }',
  '```',
  'El operador verá las opciones como botones y su elección llegará como el',
  'siguiente mensaje. Usa esto solo para decisiones reales (2 a 6 opciones); si',
  'puedes decidir razonablemente tú mismo, hazlo y sigue sin preguntar.',
].join('\n')
