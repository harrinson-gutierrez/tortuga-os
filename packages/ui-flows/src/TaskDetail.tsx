import type { ApiClient } from '@tortuga-os/api-client'
import type {
  AgentRunDTO,
  GateDTO,
  GateType,
  IterationDTO,
  QaVerdictResponseDTO,
  StepAckDTO,
} from '@tortuga-os/contracts'
import { AGENT_KINDS, AGENT_PROVIDERS } from '@tortuga-os/contracts'
import type { ProjectStack as DBProjectStack } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select, Stack, TextField } from '@tortuga-os/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentRunsPanel } from './AgentRunsPanel'
import { GatesPanel } from './GatesPanel'
import { CoworkerLiveView, ScaffoldPanel } from './ScaffoldPanel'
import { TroubleshootStepBody } from './TroubleshootShell'
import { WorkspacePanel } from './WorkspacePanel'
import { useAsyncData } from './useAsyncData'

/**
 * Stack family used to pick the gate commands (analyze, build). This is
 * a coarser bucket than the DB-level project.stack (which is more
 * specific like 'flutter-supabase'). Keep it separate to avoid leaking
 * persistence-shape into the gate runner config.
 */
export type ProjectStack = 'flutter' | 'nextjs' | 'vite-react' | 'angular' | 'astro' | 'node'

export interface TaskDetailProps {
  client: ApiClient
  taskId: string
  projectCode?: string
  /** Stack used to pick the build/typecheck commands for gates. */
  stack?: ProjectStack
  /**
   * The persisted project.stack from the DB ('flutter-supabase',
   * 'nextjs-supabase', etc.). Drives which specialized dev agent the
   * wizard preselects. Null until the scaffold has run.
   */
  projectStack?: DBProjectStack | null
  /**
   * Whether the project's T0 architecture task is approved. When false and
   * the current task is an `impl`, the wizard blocks the "Run agent" step
   * with a CTA that jumps to the arch task instead.
   */
  archApproved?: boolean
  archTaskId?: string | null
  onSelectArchTask?: () => void
  /**
   * Optional close action. When provided, the task header shows a
   * "← Volver a la lista" button so the operator can deselect this
   * task and scroll back to the task list without manual scrolling.
   */
  onClose?: () => void
  refreshKey?: number
  onChanged?: () => void
}

type StepStatus = 'done' | 'current' | 'todo' | 'blocked'

interface Step {
  id: string
  title: string
  hint?: string
  status: StepStatus
  body?: React.ReactNode
}

const AGENT_LABEL: Record<(typeof AGENT_KINDS)[number], string> = {
  dev: 'Programador',
  'dev-flutter': 'Programador Flutter',
  'dev-nextjs': 'Programador Next.js',
  'dev-vite-react': 'Programador React',
  'dev-node': 'Programador Node',
  designer: 'Diseñador',
  qa: 'Revisor de calidad',
  sales: 'Comercial',
  pm: 'Project manager',
  tech_lead: 'Tech lead',
  arch: 'Arquitecto',
  troubleshooter: 'Diagnóstico de errores',
  'scaffold-fixer': 'Reparador de scaffold',
  'gate-fixer': 'Reparador de gates',
}

const PROVIDER_LABEL: Record<(typeof AGENT_PROVIDERS)[number], string> = {
  'claude-cli': 'Claude (CLI local, edita archivos)',
  'anthropic-sdk': 'Claude (API, solo texto)',
  ollama: 'Ollama (local)',
}

export function TaskDetail({
  client,
  taskId,
  projectCode,
  stack = 'node',
  projectStack = null,
  archApproved = true,
  archTaskId = null,
  onSelectArchTask,
  onClose,
  refreshKey = 0,
  onChanged,
}: TaskDetailProps) {
  // Two refresh signals:
  //  - globalKey: bumped on user actions; refetches everything (task, iterations, gates, workspace tree)
  //  - runsKey: bumped every 1s while a run is in flight; ONLY runs re-fetches
  // This keeps the workspace tree, scroll positions, and selected file stable
  // while the agent's transcript streams in.
  const [globalKey, setGlobalKey] = useState(0)
  const [runsKey, setRunsKey] = useState(0)
  const [gatesKey, setGatesKey] = useState(0)
  const bump = () => {
    setGlobalKey((k) => k + 1)
    onChanged?.()
  }
  const bumpGates = () => setGatesKey((k) => k + 1)

  const task = useAsyncData(() => client.tasks.get(taskId), [client, taskId, refreshKey, globalKey])
  const iterations = useAsyncData(
    () => client.tasks.listIterations(taskId),
    [client, taskId, refreshKey, globalKey],
  )
  const runs = useAsyncData(
    () => client.agentRuns.listForTask(taskId),
    [client, taskId, refreshKey, globalKey, runsKey],
  )
  const currentIter = iterations.data?.[0] ?? null
  const gates = useAsyncData(
    () => (currentIter ? client.gates.listForIteration(currentIter.id) : Promise.resolve([])),
    [client, currentIter?.id, refreshKey, globalKey, gatesKey],
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: bumpGates is stable; only react to gates.data
  useEffect(() => {
    const hasRunning = gates.data?.some((g) => g.status === 'pending')
    if (!hasRunning) return
    const t = setInterval(bumpGates, 1500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gates.data])
  const stepAcks = useAsyncData(
    () => client.tasks.listStepAcks(taskId),
    [client, taskId, refreshKey, globalKey],
  )

  // Split active-run detection by kind. The wizard has two distinct steps
  // that can each be "in flight": the dev agent (step 2) and the QA agent
  // (step 5). If we only used a single `hasActiveRun` boolean, a running
  // QA run would also light up step 2 ("El agente está trabajando…") and
  // we'd render the same run as a transcript in both cards.
  const hasActiveDevRun = useMemo(
    () =>
      runs.data?.some(
        (r) => (r.status === 'queued' || r.status === 'running') && r.agentKind !== 'qa',
      ) ?? false,
    [runs.data],
  )
  const hasActiveQaRun = useMemo(
    () =>
      runs.data?.some(
        (r) => (r.status === 'queued' || r.status === 'running') && r.agentKind === 'qa',
      ) ?? false,
    [runs.data],
  )
  const hasAnyActiveRun = hasActiveDevRun || hasActiveQaRun

  // Poll only the runs endpoint while one is active. Bump globalKey once
  // when the run finishes so the file tree, gates, and task header pick
  // up the newly-created artifacts.
  useEffect(() => {
    if (!hasAnyActiveRun) return
    const t = setInterval(() => setRunsKey((k) => k + 1), 1000)
    return () => clearInterval(t)
  }, [hasAnyActiveRun])

  const prevActiveRef = useRef(false)
  useEffect(() => {
    if (prevActiveRef.current && !hasAnyActiveRun) {
      setGlobalKey((k) => k + 1)
    }
    prevActiveRef.current = hasAnyActiveRun
  }, [hasAnyActiveRun])

  // IMPORTANT: All hooks must run on every render, including the loading
  // pass. Derive the QA verdict id directly from runs.data (which may
  // still be null on the first paint) and keep the useAsyncData call
  // unconditional so React doesn't see a different hook count between
  // the "loading task" and "task loaded" renders.
  const qaRunDoneId =
    runs.data?.find((r) => r.status === 'succeeded' && r.agentKind === 'qa')?.id ?? null
  const qaVerdictFetch = useAsyncData<QaVerdictResponseDTO | null>(
    () => (qaRunDoneId ? client.agentRuns.qaVerdict(qaRunDoneId) : Promise.resolve(null)),
    [client, qaRunDoneId, refreshKey, globalKey, runsKey],
  )

  if (task.error && !task.data)
    return (
      <Card>
        <div className="text-[13px] text-danger">{task.error}</div>
      </Card>
    )
  if (!task.data)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando tarea…</div>
      </Card>
    )

  const t = task.data
  // Pull the most recent non-QA run for step 2 ("Agent working"). Using
  // runs[0] indiscriminately would surface a QA run inside the dev step.
  const latestRun = runs.data?.find((r) => r.agentKind !== 'qa') ?? null
  // Pick the latest non-QA agent run as the "dev" run (the one that
  // actually edited files). QA runs are filtered out so the
  // "Agente editó N archivos" card doesn't mistake the QA reviewer for
  // the implementer.
  const lastSuccessfulRun =
    runs.data?.find((r) => r.status === 'succeeded' && r.agentKind !== 'qa') ?? null
  const qaRuns = (runs.data ?? []).filter((r) => r.agentKind === 'qa')
  const buildGate = gates.data?.find((g) => g.gateType === 'G3_BUILD') ?? null
  const analyzeGate = gates.data?.find((g) => g.gateType === 'G1_ANALYZE') ?? null
  const realWorkGate = gates.data?.find((g) => g.gateType === 'G6_REAL_WORK') ?? null
  const fidelityGate = gates.data?.find((g) => g.gateType === 'G5_FIDELITY') ?? null
  const bootGate = gates.data?.find((g) => g.gateType === 'G4_BOOT') ?? null
  // Verify step is "green" only when ALL the mandatory gates passed.
  // G5/G4 stay optional for now (they need golden baselines and a live
  // device, respectively) — gating them too aggressively would block
  // valid tasks. Once G6 is rock-solid we promote them.
  const gatesPassed =
    analyzeGate?.status === 'passed' &&
    buildGate?.status === 'passed' &&
    realWorkGate?.status === 'passed'

  const steps = buildSteps({
    client,
    taskId,
    projectCode,
    task: t,
    stack,
    projectStack,
    archApproved,
    archTaskId,
    onSelectArchTask,
    hasActiveDevRun,
    hasActiveQaRun,
    latestRun,
    lastSuccessfulRun,
    qaRuns,
    qaVerdictResp: qaVerdictFetch.data ?? null,
    analyzeGate,
    buildGate,
    realWorkGate,
    fidelityGate,
    bootGate,
    gatesPassed,
    stepAcks: stepAcks.data ?? [],
    refreshKey: refreshKey + globalKey,
    onChanged: bump,
  })

  return (
    // overflow-anchor:auto tells the browser to keep the user's visible
    // anchor element pinned across layout shifts caused by polling
    // refetches. Without this the page jumps to the top each time the
    // wizard re-renders during a clean/verify cycle.
    <Stack gap="md" style={{ overflowAnchor: 'auto' }}>
      <Card>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-text-muted hover:text-text mb-2 font-mono"
          >
            ← Volver a la lista de tareas
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
              {t.code}
            </div>
            <h3 className="font-display font-medium text-[18px] tracking-tighter-2 mt-1 m-0">
              {humanizeTaskTitle(t.type, t.ownerRole)}
            </h3>
            <div className="mt-1 text-[12px] text-text-muted">
              Iteración {t.currentIteration} · estado:{' '}
              <span className="text-text">{humanizeStatus(t.status)}</span>
            </div>
          </div>
          <Badge tone={statusTone(t.status)} outline>
            {humanizeStatus(t.status)}
          </Badge>
        </div>
      </Card>

      <Card>
        <Eyebrow>¿Qué sigue?</Eyebrow>
        <div className="mt-4">
          <Stepper steps={steps} />
        </div>
      </Card>

      {/* NOTE: EmulatorPanel used to live here as a Card. It's now
          rendered by App.tsx as a fixed right sidebar when the operator
          is inside a Flutter task — closer to the wizard and always
          visible while validating. */}

      {projectCode && (
        <WorkspacePanel
          client={client}
          projectCode={projectCode}
          refreshKey={refreshKey + globalKey}
          preselectPath={
            lastSuccessfulRun ? `05-build/_agent-runs/${lastSuccessfulRun.id}.md` : null
          }
        />
      )}

      <Disclosure
        label="Detalles técnicos"
        count={countDetails(runs.data, gates.data, iterations.data)}
      >
        <div className="space-y-4">
          <IterationHistory iterations={iterations.data ?? []} />
          <GatesPanel
            client={client}
            taskId={taskId}
            iterationId={currentIter?.closedAt ? null : (currentIter?.id ?? null)}
            refreshKey={refreshKey + globalKey}
            onChanged={bump}
          />
          <AgentRunsPanel
            client={client}
            taskId={taskId}
            refreshKey={refreshKey + globalKey + runsKey}
            onChanged={bump}
          />
        </div>
      </Disclosure>
    </Stack>
  )
}

function buildSteps(args: {
  client: ApiClient
  taskId: string
  projectCode?: string
  task: { id: string; status: string; currentIteration: number; type: string }
  stack: ProjectStack
  projectStack: DBProjectStack | null
  archApproved: boolean
  archTaskId: string | null
  onSelectArchTask?: () => void
  hasActiveDevRun: boolean
  hasActiveQaRun: boolean
  latestRun: AgentRunDTO | null
  lastSuccessfulRun: AgentRunDTO | null
  qaRuns: AgentRunDTO[]
  qaVerdictResp: QaVerdictResponseDTO | null
  analyzeGate: GateDTO | null
  buildGate: GateDTO | null
  realWorkGate: GateDTO | null
  fidelityGate: GateDTO | null
  bootGate: GateDTO | null
  gatesPassed: boolean
  stepAcks: StepAckDTO[]
  refreshKey: number
  onChanged: () => void
}): Step[] {
  const {
    client,
    taskId,
    projectCode,
    task,
    stack,
    projectStack,
    archApproved,
    archTaskId,
    onSelectArchTask,
    hasActiveDevRun,
    latestRun,
    lastSuccessfulRun,
    analyzeGate,
    buildGate,
    realWorkGate,
    fidelityGate,
    bootGate,
    gatesPassed,
    stepAcks,
    refreshKey,
    onChanged,
  } = args
  const ackByStepId = new Map(stepAcks.map((a) => [a.stepId, a]))
  const ackOf = (stepId: string): StepAckDTO | null => ackByStepId.get(stepId) ?? null
  // hasActiveQaRun is kept on the args type for symmetry with hasActiveDevRun
  // and to make future step-QA logic easier; the step currently derives its
  // own active flag from qaRuns[0].status. Suppress unused destructure.
  void args.hasActiveQaRun

  const isApproved = task.status === 'approved'
  const isRejected = task.status === 'rejected'
  const inQa = task.status === 'qa'
  const inProgress = task.status === 'in_progress'
  const pending = task.status === 'pending'

  const stepStart: Step = {
    id: 'start',
    title: pending ? 'Empezar la tarea' : 'Tarea iniciada',
    hint: pending ? 'Abre una iteración para poder trabajar.' : undefined,
    status: pending ? 'current' : 'done',
    body: pending ? (
      <PrimaryAction
        label="▶ Empezar"
        onClick={async () => {
          await client.tasks.start(taskId)
          onChanged()
        }}
      />
    ) : null,
  }

  const editedFiles = lastSuccessfulRun ? editedFilesFromOutput(lastSuccessfulRun.output ?? '') : []
  const agentEdited = editedFiles.length > 0
  const agentVerified =
    lastSuccessfulRun != null &&
    !agentEdited &&
    outputLooksAlreadyImplemented(lastSuccessfulRun.output ?? '')
  const agentRespondedNoEdits = lastSuccessfulRun != null && !agentEdited && !agentVerified
  const agentDone = agentEdited || agentVerified

  // The most recent dev run finished as cancelled or failed AFTER the last
  // successful one — usually because the sidecar restarted mid-run while we
  // were hot-iterating. Surface it as a yellow card so the operator knows
  // why "nothing happened" instead of staring at the default "Lanzar agente"
  // button as if no run had been attempted.
  const devRunInterrupted =
    latestRun != null &&
    (latestRun.status === 'cancelled' || latestRun.status === 'failed') &&
    (lastSuccessfulRun == null || latestRun.createdAt > lastSuccessfulRun.createdAt)

  // Architecture gate: implementation tasks must wait until the T0 arch
  // task is approved (so ARCHITECTURE.md exists and dev agents inherit
  // coherent decisions).
  const archGateBlocks =
    task.type !== 'arch' && !archApproved && archTaskId !== null && archTaskId !== task.id

  // Pick the right default agent kind for the task type so the operator
  // doesn't have to remember which agent maps to which task. For impl
  // tasks, prefer the stack-specialized prompt when the project's stack
  // is known (i.e. after the scaffold step).
  const defaultAgentKind: (typeof AGENT_KINDS)[number] = (() => {
    if (task.type === 'arch') return 'arch'
    if (task.type !== 'impl') return 'dev'
    if (projectStack?.startsWith('flutter')) return 'dev-flutter'
    if (projectStack === 'nextjs-supabase') return 'dev-nextjs'
    if (projectStack === 'vite-react') return 'dev-vite-react'
    if (projectStack === 'node-fastify') return 'dev-node'
    return 'dev'
  })()

  const isArchTask = task.type === 'arch'

  const stepAgent: Step = {
    id: 'agent',
    title: isArchTask
      ? 'Crear el esqueleto del proyecto'
      : hasActiveDevRun
        ? 'El agente está trabajando…'
        : agentEdited
          ? `Agente editó ${editedFiles.length} archivo${editedFiles.length === 1 ? '' : 's'}`
          : agentVerified
            ? 'Agente verificó: feature ya implementada'
            : agentRespondedNoEdits
              ? 'El agente respondió, pero no editó nada'
              : archGateBlocks
                ? 'Falta definir la arquitectura primero'
                : 'Ejecutar agente',
    hint: isArchTask
      ? 'Plantilla determinista: corre los comandos del stack, escribe los archivos base y deja ARCHITECTURE.md.'
      : hasActiveDevRun
        ? 'Estás viendo en vivo lo que escribe el LLM. Puedes cancelar abajo.'
        : agentEdited
          ? `Tokens ${lastSuccessfulRun!.tokensIn}/${lastSuccessfulRun!.tokensOut} · costo $${(lastSuccessfulRun!.costCents / 100).toFixed(2)}`
          : agentVerified
            ? `Sin cambios: el código ya cumple acceptance criteria. Tokens ${lastSuccessfulRun!.tokensIn}/${lastSuccessfulRun!.tokensOut} · costo $${(lastSuccessfulRun!.costCents / 100).toFixed(2)}`
            : agentRespondedNoEdits
              ? 'Las instrucciones no fueron suficientes. Relanza con más detalle.'
              : archGateBlocks
                ? 'Antes de implementar features, corre la tarea de arquitectura para scaffoldar el proyecto y dejar ARCHITECTURE.md.'
                : 'Lanza un agente LLM local para que trabaje en esta tarea.',
    status: pending
      ? 'todo'
      : hasActiveDevRun
        ? 'current'
        : agentDone
          ? 'done'
          : agentRespondedNoEdits
            ? 'blocked'
            : archGateBlocks
              ? 'blocked'
              : 'current',
    body: (() => {
      if (pending || isApproved || isRejected || inQa) return null
      // For the architecture/T0 task: skip the LLM agent entirely and
      // run a deterministic scaffold from a JSON template. Same output
      // every time, no permission prompts, no hallucinated decisions.
      if (task.type === 'arch' && projectCode) {
        return (
          <ScaffoldPanel
            client={client}
            projectCode={projectCode}
            taskId={taskId}
            onDone={() => onChanged()}
          />
        )
      }
      if (hasActiveDevRun && latestRun) {
        return <RunTranscript run={latestRun} live client={client} onChanged={onChanged} />
      }
      if (agentDone && lastSuccessfulRun) {
        return (
          <RunTranscriptWithRelaunch
            run={lastSuccessfulRun}
            editedFiles={editedFiles}
            client={client}
            taskId={taskId}
            stack={stack}
            defaultAgentKind={defaultAgentKind}
            onChanged={onChanged}
          />
        )
      }
      if (agentRespondedNoEdits && lastSuccessfulRun) {
        return (
          <div>
            <RunTranscript run={lastSuccessfulRun} live={false} editedFiles={[]} />
            <div className="mt-3">
              <LaunchAgentInline
                client={client}
                taskId={taskId}
                stack={stack}
                defaultAgentKind={defaultAgentKind}
                onLaunched={onChanged}
                retryLabel="▶ Volver a lanzar con instrucciones más claras"
              />
            </div>
          </div>
        )
      }
      if (archGateBlocks) {
        return (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <div className="text-[12px] text-text">
              Esta tarea depende de la tarea de arquitectura del proyecto. El agente arquitecto va a
              scaffoldar el proyecto y a escribir un <code>ARCHITECTURE.md</code> que esta tarea y
              todas las siguientes van a leer.
            </div>
            {onSelectArchTask && (
              <div className="mt-3 flex justify-end">
                <Button variant="turtle" onClick={onSelectArchTask}>
                  ▶ Ir a la tarea de arquitectura
                </Button>
              </div>
            )}
          </div>
        )
      }
      if (devRunInterrupted && latestRun) {
        return (
          <div className="space-y-3">
            <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-[12px]">
              <div className="font-medium text-warning">
                El último run terminó como{' '}
                {latestRun.status === 'cancelled' ? 'cancelado' : 'fallido'}
              </div>
              <div className="mt-1 text-text-soft">
                {latestRun.errorMessage ??
                  'Probablemente el sidecar se reinició mientras corría. Relánzalo abajo.'}
              </div>
            </div>
            {latestRun.output && latestRun.output.trim().length > 0 && (
              <RunTranscript run={latestRun} live={false} editedFiles={[]} />
            )}
            <LaunchAgentInline
              client={client}
              taskId={taskId}
              stack={stack}
              defaultAgentKind={defaultAgentKind}
              onLaunched={onChanged}
              retryLabel="▶ Volver a lanzar"
            />
          </div>
        )
      }
      return (
        <LaunchAgentInline
          client={client}
          taskId={taskId}
          stack={stack}
          defaultAgentKind={defaultAgentKind}
          onLaunched={onChanged}
        />
      )
    })(),
  }

  const anyGateFailed = analyzeGate?.status === 'failed' || buildGate?.status === 'failed'

  const stepVerify: Step = {
    id: 'verify',
    title: gatesPassed
      ? 'Código verificado ✓'
      : anyGateFailed
        ? 'La verificación falló'
        : 'Verificar el código',
    hint: gatesPassed
      ? ackOf('verify')?.ack === 'ok'
        ? 'Tipos OK + compila bien (confirmado por ti).'
        : 'Tipos OK + compila bien. Pendiente tu confirmación.'
      : anyGateFailed
        ? 'Revisa el error abajo y decide cómo seguir.'
        : 'Corre los chequeos automáticos (tipos + build).',
    status: !agentDone
      ? 'todo'
      : gatesPassed
        ? ackOf('verify')?.ack === 'ok'
          ? 'done'
          : 'current'
        : anyGateFailed
          ? 'blocked'
          : 'current',
    body:
      agentDone && !gatesPassed && !isApproved && !isRejected && !inQa ? (
        <VerifyInline
          client={client}
          taskId={taskId}
          projectCode={projectCode}
          stack={stack}
          defaultAgentKind={defaultAgentKind}
          analyzeGate={analyzeGate}
          buildGate={buildGate}
          realWorkGate={realWorkGate}
          fidelityGate={fidelityGate}
          bootGate={bootGate}
          onChanged={onChanged}
        />
      ) : gatesPassed && !isApproved && !isRejected ? (
        <>
          <GatesSummary
            client={client}
            taskId={taskId}
            stack={stack}
            analyzeGate={analyzeGate}
            buildGate={buildGate}
            realWorkGate={realWorkGate}
            fidelityGate={fidelityGate}
            bootGate={bootGate}
            runningGates={[]}
          />
          <StepAckPanel
            client={client}
            taskId={taskId}
            stepId="verify"
            ack={ackOf('verify')}
            canAck
            label="Verificación del código"
            onChanged={onChanged}
          />
          <RereverifyInline client={client} taskId={taskId} stack={stack} onChanged={onChanged} />
        </>
      ) : null,
  }

  // Manual-test gate: even when automated checks pass, the operator
  // should personally see the app running in the emulator before
  // marking the task ready for QA. We track this per-task in localStorage
  // so a refresh doesn't lose the confirmation.
  const manualTestKey = `tortuga.manualTest.${taskId}`
  const isFlutterImpl = stack === 'flutter' && task.type === 'impl'
  const manuallyTested =
    typeof window !== 'undefined' && window.localStorage.getItem(manualTestKey) === '1'

  const stepManualTest: Step | null = isFlutterImpl
    ? {
        id: 'manual-test',
        title: manuallyTested ? 'Probado manualmente ✓' : 'Pruébalo tú mismo en el emulador',
        hint: manuallyTested
          ? 'Confirmaste que la app se comporta como esperabas.'
          : 'Enciende el emulador a la derecha, corre la app y verifica que funcione. Luego marca como probado.',
        status:
          isApproved || isRejected
            ? 'done'
            : manuallyTested
              ? 'done'
              : gatesPassed
                ? 'current'
                : 'todo',
        body:
          gatesPassed && inProgress && !manuallyTested ? (
            <ManualTestInline
              onConfirm={() => {
                window.localStorage.setItem(manualTestKey, '1')
                onChanged()
              }}
            />
          ) : null,
      }
    : null

  const isBugfix = task.type === 'bugfix'

  // Troubleshoot step: appears (a) after manualTest is confirmed on an
  // impl task, OR (b) always on a bugfix task (which exists precisely
  // because a runtime error was reported). Does NOT block QA — they're
  // independent gates.
  const showTroubleshootStep = isBugfix || (isFlutterImpl && manuallyTested)
  const stepTroubleshoot: Step | null = showTroubleshootStep
    ? {
        id: 'troubleshoot',
        title: isBugfix ? 'Diagnóstico y fix del error' : '¿Algo falla? Repórtalo',
        hint: isBugfix
          ? 'El agente troubleshooter ya está diagnosticando el error reportado. Revisa lo que propone abajo.'
          : 'Si al probar la app encontraste errores (RLS, null, build, etc), pégalos aquí y el agente diagnostica + propone fix sin interrumpir tu flujo de QA.',
        status: isApproved || isRejected ? 'done' : 'current',
        body: <TroubleshootStepBody client={client} taskId={taskId} refreshKey={refreshKey} />,
      }
    : null

  const inWork = inProgress || task.status === 'rework'
  const canRunQa = gatesPassed && inWork && (manuallyTested || !isFlutterImpl)

  const { qaRuns, qaVerdictResp } = args
  const qaRun: AgentRunDTO | null = qaRuns[0] ?? null
  const qaActive = qaRun?.status === 'queued' || qaRun?.status === 'running'
  const qaDone = qaRun?.status === 'succeeded'
  // A QA verdict is only meaningful if no dev/impl run has started AFTER it
  // — once the operator asks the dev agent to fix the defects, the previous
  // verdict refers to stale code. We detect this by comparing createdAt
  // timestamps; if a non-QA run is newer than the latest QA run, the
  // verdict is dropped and the step falls back to "run QA again".
  const newestDevRunSince = qaRun
    ? lastSuccessfulRun && lastSuccessfulRun.createdAt > qaRun.createdAt
      ? lastSuccessfulRun
      : null
    : null
  const qaVerdictStale = newestDevRunSince !== null || hasActiveDevRun
  const qaVerdict =
    qaDone && !qaVerdictStale && qaVerdictResp?.verdict
      ? {
          verdict: qaVerdictResp.verdict.verdict,
          criteria: qaVerdictResp.verdict.acceptanceCriteria,
          defects: qaVerdictResp.verdict.defects,
          notes: qaVerdictResp.verdict.notes,
          raw: qaVerdictResp.rawOutput,
        }
      : null
  const qaApproved = qaVerdict?.verdict === 'APPROVED'
  const qaRejected = qaVerdict?.verdict === 'REJECTED'
  // QA finished but no verdict could be parsed (neither JSON file nor markdown).
  // Surface this as a distinct state so the operator isn't stuck on
  // "Primero deja que QA automática revise" with no signal.
  const qaVerdictMissing = qaDone && !qaVerdictStale && qaVerdictResp?.source === 'none'

  const stepQa: Step = {
    id: 'qa',
    title: inQa
      ? 'En revisión humana'
      : qaActive
        ? 'QA automática corriendo…'
        : qaApproved
          ? 'QA automática aprobó ✓'
          : qaRejected
            ? 'QA automática encontró problemas'
            : qaVerdictMissing
              ? 'QA terminó sin veredicto válido'
              : 'Pasar por QA automática',
    hint: inQa
      ? 'Esperando tu decisión final abajo.'
      : qaActive
        ? 'Un agente revisor está leyendo el código y los acceptance criteria.'
        : qaApproved
          ? 'El revisor no encontró defectos. Ya puedes enviar a tu aprobación final.'
          : qaRejected
            ? 'Revisa los defectos abajo y decide si los corriges o aprobar igual bajo tu criterio.'
            : qaVerdictMissing
              ? 'El agente respondió pero no escribió qa-verdict.json ni un bloque "## Verdict". Relánzalo o aprueba/rechaza tú directamente.'
              : isFlutterImpl && !manuallyTested
                ? 'Primero confirma que probaste la app en el emulador (paso anterior).'
                : 'Lanza un agente revisor que audita acceptance criteria + lint.',
    status:
      isApproved || isRejected
        ? 'done'
        : inQa
          ? 'done'
          : qaActive
            ? 'current'
            : qaApproved
              ? 'done'
              : qaRejected
                ? 'blocked'
                : qaVerdictMissing
                  ? 'blocked'
                  : canRunQa
                    ? 'current'
                    : 'todo',
    body:
      isApproved || isRejected || inQa ? null : qaActive && qaRun ? (
        <RunTranscript run={qaRun} live client={client} onChanged={onChanged} />
      ) : qaDone && qaVerdict ? (
        <QaVerdictCard
          run={qaRun!}
          verdict={qaVerdict}
          client={client}
          taskId={taskId}
          editedFiles={editedFiles}
          defaultAgentKind={defaultAgentKind}
          manualTestKey={manualTestKey}
          onChanged={onChanged}
        />
      ) : qaVerdictMissing ? (
        <QaVerdictMissing
          run={qaRun!}
          client={client}
          taskId={taskId}
          editedFiles={editedFiles}
          onChanged={onChanged}
        />
      ) : canRunQa ? (
        <LaunchQaInline
          client={client}
          taskId={taskId}
          editedFiles={editedFiles}
          onLaunched={onChanged}
        />
      ) : null,
  }

  // Fast path: when all gates passed and (for Flutter) the operator already
  // confirmed the emulator test, the LLM QA loop is mostly redundant — the
  // deterministic gates already proved the code builds, types check, and
  // tests pass. Allow approve without waiting for the QA agent.
  const gatesAutoApprove = gatesPassed && (manuallyTested || !isFlutterImpl)
  const canApprove = (qaApproved || qaRejected || qaVerdictMissing || gatesAutoApprove) && inWork
  const stepApprove: Step = {
    id: 'approve',
    title: isApproved ? 'Aprobada ✓' : isRejected ? 'Rechazada' : 'Aprobar o rechazar',
    hint: isApproved
      ? 'La tarea está cerrada.'
      : isRejected
        ? 'Reabre la iteración para corregir.'
        : qaRejected
          ? 'QA encontró defectos. Decide si los aceptas o rechazas la tarea.'
          : qaApproved
            ? 'QA aprobó. Confirma para cerrar la tarea.'
            : qaVerdictMissing
              ? 'QA no produjo veredicto. Aprueba o rechaza bajo tu criterio.'
              : gatesAutoApprove
                ? 'Gates en verde. Puedes aprobar directo o lanzar QA para una revisión más profunda.'
                : 'Primero deja que QA automática revise.',
    status: isApproved ? 'done' : isRejected ? 'blocked' : inQa || canApprove ? 'current' : 'todo',
    body: inQa ? (
      <ApproveRejectInline
        client={client}
        taskId={taskId}
        manualTestKey={manualTestKey}
        onChanged={onChanged}
      />
    ) : canApprove ? (
      <ApproveRejectInline
        client={client}
        taskId={taskId}
        manualTestKey={manualTestKey}
        needsSubmit
        onChanged={onChanged}
      />
    ) : isApproved || isRejected ? (
      <ReopenInline
        client={client}
        taskId={taskId}
        wasApproved={isApproved}
        onChanged={onChanged}
      />
    ) : null,
  }

  // For bugfix tasks the wizard collapses: there's no story brief to
  // implement, no manual test gate (the runtime error already implies
  // the operator was testing). The flow is: start → troubleshoot →
  // approve. QA still runs on demand.
  if (isBugfix && stepTroubleshoot) {
    return [stepStart, stepTroubleshoot, stepQa, stepApprove]
  }

  const all: Step[] = [stepStart, stepAgent, stepVerify]
  if (stepManualTest) all.push(stepManualTest)
  if (stepTroubleshoot) all.push(stepTroubleshoot)
  all.push(stepQa, stepApprove)
  return all
}

function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-3 m-0 p-0 list-none">
      {steps.map((s, i) => (
        <li key={s.id} className="flex gap-3 items-start">
          <div className="flex flex-col items-center pt-0.5">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono ${stepBubbleClass(s.status)}`}
            >
              {s.status === 'done' ? '✓' : s.status === 'blocked' ? '!' : i + 1}
            </div>
            {i < steps.length - 1 && <div className="w-px h-6 bg-border mt-1" aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[14px] ${stepTitleClass(s.status)}`}>
              {s.title}
              {s.status === 'current' && (
                <span className="ml-2 text-[11px] uppercase tracking-eyebrow text-brand">
                  ahora
                </span>
              )}
            </div>
            {s.hint && <div className="mt-0.5 text-[12px] text-text-muted">{s.hint}</div>}
            {s.body && <div className="mt-3">{s.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function stepBubbleClass(status: StepStatus): string {
  switch (status) {
    case 'done':
      return 'bg-turtle text-white'
    case 'current':
      return 'bg-brand text-white'
    case 'blocked':
      return 'bg-danger text-white'
    default:
      return 'bg-bg-alt text-text-muted border border-border'
  }
}

function stepTitleClass(status: StepStatus): string {
  switch (status) {
    case 'done':
      return 'text-text-muted line-through'
    case 'current':
      return 'text-text font-medium'
    case 'blocked':
      return 'text-danger font-medium'
    default:
      return 'text-text-muted'
  }
}

function ManualTestInline({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <div className="text-[12px] text-text-soft">Sigue estos pasos a la derecha:</div>
      <ol className="mt-2 ml-4 list-decimal text-[12px] text-text-soft space-y-1">
        <li>
          Enciende el emulador con <strong>▶ Encender</strong>
        </li>
        <li>
          Cuando aparezca el dispositivo, dale <strong>▶ Instalar y correr</strong>
        </li>
        <li>Verifica que la app abra y la pantalla nueva funcione</li>
      </ol>
      <div className="mt-3 flex justify-end">
        <Button variant="turtle" size="sm" onClick={onConfirm}>
          ✓ Funciona, marcar como probado
        </Button>
      </div>
    </div>
  )
}

function PrimaryAction({
  label,
  onClick,
  variant = 'turtle',
}: {
  label: string
  onClick: () => Promise<void> | void
  variant?: 'turtle' | 'primary' | 'ghost'
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant={variant}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onClick()
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? '…' : label}
    </Button>
  )
}

function LaunchAgentInline({
  client,
  taskId,
  stack,
  defaultAgentKind = 'dev',
  onLaunched,
  retryLabel,
}: {
  client: ApiClient
  taskId: string
  stack: ProjectStack
  defaultAgentKind?: (typeof AGENT_KINDS)[number]
  onLaunched: () => void
  retryLabel?: string
}) {
  // The wizard already decides which agent to run from the task type +
  // project.stack. The dropdown only shows up if we couldn't decide
  // (defaultAgentKind === 'dev'), which is the fallback for projects
  // that don't yet have a stack picked. For impl tasks on a known stack,
  // the agent is locked and the operator only writes the brief.
  const agentKindLocked = defaultAgentKind !== 'dev'
  const [agentKind, setAgentKind] = useState<(typeof AGENT_KINDS)[number]>(defaultAgentKind)
  const [provider, setProvider] = useState<(typeof AGENT_PROVIDERS)[number]>('claude-cli')
  const [extraPrompt, setExtraPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = promptTemplateFor(agentKind, stack)
  const usingTemplate = extraPrompt.trim().length === 0

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await client.agentRuns.create({
        taskId,
        agentKind,
        provider,
        extraPrompt: extraPrompt.trim() || undefined,
      })
      onLaunched()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      {agentKindLocked ? (
        <div className="text-[12px] text-text-muted">
          Agente: <span className="text-text font-medium">{AGENT_LABEL[agentKind]}</span>
          <span className="text-text-dim"> · {PROVIDER_LABEL[provider]}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="¿Qué tipo de agente?"
            value={agentKind}
            onChange={(e) => setAgentKind(e.target.value as (typeof AGENT_KINDS)[number])}
            options={AGENT_KINDS.map((k) => ({ value: k, label: AGENT_LABEL[k] }))}
          />
          <Select
            label="¿Qué motor LLM?"
            value={provider}
            onChange={(e) => setProvider(e.target.value as (typeof AGENT_PROVIDERS)[number])}
            options={AGENT_PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] }))}
          />
        </div>
      )}
      <div className="mt-2">
        <label
          htmlFor="task-detail-agent-instructions"
          className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1"
        >
          Instrucciones para el agente
        </label>
        <textarea
          id="task-detail-agent-instructions"
          className="w-full bg-bg border border-border rounded-md px-3 py-2 text-[13px] text-text font-mono leading-snug min-h-[120px] focus:outline-none focus:border-brand"
          placeholder={template}
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
        />
        {usingTemplate && (
          <div className="mt-1 flex items-center justify-between text-[11px] text-text-muted">
            <span>Plantilla sugerida arriba. Edítala con los detalles de tu caso.</span>
            <button
              className="text-brand hover:underline"
              onClick={() => setExtraPrompt(template)}
              type="button"
            >
              Usar plantilla
            </button>
          </div>
        )}
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      <div className="mt-3 flex justify-end">
        <Button variant="turtle" onClick={submit} disabled={busy}>
          {busy ? 'Lanzando…' : (retryLabel ?? '▶ Lanzar agente')}
        </Button>
      </div>
    </div>
  )
}

function VerifyInline({
  client,
  taskId,
  projectCode,
  stack,
  defaultAgentKind,
  analyzeGate,
  buildGate,
  realWorkGate,
  fidelityGate,
  bootGate,
  onChanged,
}: {
  client: ApiClient
  taskId: string
  projectCode?: string
  stack: ProjectStack
  defaultAgentKind: (typeof AGENT_KINDS)[number]
  analyzeGate: GateDTO | null
  buildGate: GateDTO | null
  realWorkGate: GateDTO | null
  fidelityGate: GateDTO | null
  bootGate: GateDTO | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsEmulator, setNeedsEmulator] = useState(false)
  const [recheckBusy, setRecheckBusy] = useState(false)
  const isFlutter = stack === 'flutter'

  async function hasLiveDevice(): Promise<boolean> {
    try {
      const { devices } = await client.preview.listDevices()
      return devices.some((d) => d.state === 'device')
    } catch {
      return false
    }
  }

  async function run() {
    setBusy(true)
    setError(null)
    setNeedsEmulator(false)
    const y = window.scrollY
    try {
      const gatesToRun: GateType[] = ['G1_ANALYZE', 'G3_BUILD', 'G6_REAL_WORK', 'G5_FIDELITY']
      if (isFlutter) {
        const hasDevice = await hasLiveDevice()
        if (!hasDevice) {
          setNeedsEmulator(true)
        } else {
          gatesToRun.push('G4_BOOT')
        }
      }
      await client.gates.runForTask(taskId, { stack, gates: gatesToRun })
      onChanged()
      requestAnimationFrame(() => {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior })
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function recheckAndRunBoot() {
    setRecheckBusy(true)
    try {
      const hasDevice = await hasLiveDevice()
      if (!hasDevice) {
        setRecheckBusy(false)
        return
      }
      setNeedsEmulator(false)
      await client.gates.runForTask(taskId, { stack, gates: ['G4_BOOT'] })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRecheckBusy(false)
    }
  }

  // Pick the first failing gate so the failure card focuses on the
  // earliest break in the chain (e.g. typecheck dies → no point showing
  // test failures since the code didn't even compile).
  const failedGate =
    (analyzeGate?.status === 'failed' && analyzeGate) ||
    (buildGate?.status === 'failed' && buildGate) ||
    (realWorkGate?.status === 'failed' && realWorkGate) ||
    (fidelityGate?.status === 'failed' && fidelityGate) ||
    (bootGate?.status === 'failed' && bootGate) ||
    null

  return (
    <div className="space-y-3">
      <GatesSummary
        client={client}
        taskId={taskId}
        stack={stack}
        analyzeGate={analyzeGate}
        buildGate={buildGate}
        realWorkGate={realWorkGate}
        fidelityGate={fidelityGate}
        bootGate={bootGate}
        runningGates={
          busy
            ? (() => {
                const ordered: Array<[GateType, GateDTO | null]> = [
                  ['G1_ANALYZE', analyzeGate],
                  ['G3_BUILD', buildGate],
                  ['G6_REAL_WORK', realWorkGate],
                  ['G5_FIDELITY', fidelityGate],
                  ['G4_BOOT', bootGate],
                ]
                const firstPending = ordered.find(([, g]) => !g || g.status === 'pending')
                return firstPending ? [firstPending[0]] : []
              })()
            : []
        }
      />
      {error && <div className="text-[12px] text-danger">{error}</div>}
      <div className="flex justify-end">
        <Button variant="turtle" onClick={run} disabled={busy}>
          {busy ? 'Verificando…' : failedGate ? '▶ Reintentar verificación' : '▶ Verificar ahora'}
        </Button>
      </div>

      {needsEmulator && (
        <div className="rounded-md border border-warning/40 bg-warning/5 p-4">
          <div className="text-[13px] text-warning font-medium">
            ⚠ Boot smoke necesita un emulador encendido
          </div>
          <div className="mt-1 text-[12px] text-text-soft">
            No detecté ningún dispositivo conectado por adb. Levanta un emulador desde el panel del
            lado (o conecta un Android físico), espera a que aparezca como <code>device</code>, y
            luego presiona <strong>↻ Validar de nuevo</strong>. Los demás gates (analyze, build,
            tests, golden) ya corrieron sin necesitar device.
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="turtle" onClick={recheckAndRunBoot} disabled={recheckBusy}>
              {recheckBusy ? '…' : '↻ Validar de nuevo'}
            </Button>
          </div>
        </div>
      )}

      {failedGate && projectCode && failedGate.outputPath && (
        <GateFailureCard
          client={client}
          projectCode={projectCode}
          taskId={taskId}
          stack={stack}
          gate={failedGate}
          defaultAgentKind={defaultAgentKind}
          onChanged={onChanged}
        />
      )}
    </div>
  )
}

function GateFailureCard({
  client,
  projectCode,
  taskId,
  stack,
  gate,
  defaultAgentKind,
  onChanged,
}: {
  client: ApiClient
  projectCode: string
  taskId: string
  stack: ProjectStack
  gate: GateDTO
  defaultAgentKind: (typeof AGENT_KINDS)[number]
  onChanged: () => void
}) {
  const log = useAsyncData(
    () =>
      gate.outputPath
        ? client.workspace.readFile(projectCode, gate.outputPath)
        : Promise.resolve(null),
    [client, projectCode, gate.outputPath, gate.updatedAt],
  )

  const [expanded, setExpanded] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [cleanError, setCleanError] = useState<string | null>(null)
  const [cleanDone, setCleanDone] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [fixError, setFixError] = useState<string | null>(null)

  const content = log.data?.content ?? ''
  const classification = classifyBuildError(content)
  const tail = lastLines(content, expanded ? 200 : 20)

  // Run a callback while preserving the page's scroll position. The
  // parent's onChanged() bumps globalKey which refetches task/runs/gates/
  // workspace — that triggers a brief unmount/remount cycle that the
  // browser interprets as "content shrank → jump to top". We snapshot
  // scrollY before the work and restore it after the refetch settles.
  async function preserveScroll(work: () => Promise<void>) {
    const y = window.scrollY
    await work()
    requestAnimationFrame(() => {
      window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior })
    })
  }

  async function runCleanThenRetry() {
    setCleaning(true)
    setCleanError(null)
    try {
      await preserveScroll(async () => {
        await client.gates.cleanForTask(taskId, { stack })
        // After cleaning, immediately re-run the gates so the operator sees
        // whether the cache fix solved it without another click.
        await client.gates.runForTask(taskId, {
          stack,
          gates: ['G1_ANALYZE', 'G3_BUILD', 'G6_REAL_WORK', 'G5_FIDELITY'],
        })
        setCleanDone(true)
        onChanged()
      })
    } catch (e) {
      setCleanError((e as Error).message)
    } finally {
      setCleaning(false)
    }
  }

  async function markAsPassed() {
    setCleaning(true)
    setCleanError(null)
    try {
      await preserveScroll(async () => {
        await client.gates.recordOutcome(gate.id, {
          status: 'passed',
          outputPath: gate.outputPath ?? null,
          // The gate is currently 'failed'; force the override because
          // the operator confirmed the APK was built (false negative).
          force: true,
        })
        setCleanDone(true)
        onChanged()
      })
    } catch (e) {
      setCleanError((e as Error).message)
    } finally {
      setCleaning(false)
    }
  }

  async function askAgentToFix() {
    setFixing(true)
    setFixError(null)
    try {
      await preserveScroll(async () => {
        const errorTail = lastLines(content, 80)
        const extraPrompt = `La verificación falló con este log de ${gateHumanName(gate.gateType)}. Léelo y haz el cambio MÍNIMO para que pase. No agregues features, no refactorices.\n\n\`\`\`\n${errorTail}\n\`\`\``
        await client.agentRuns.create({
          taskId,
          agentKind: defaultAgentKind,
          provider: 'claude-cli',
          extraPrompt,
        })
        onChanged()
      })
    } catch (e) {
      setFixError((e as Error).message)
    } finally {
      setFixing(false)
    }
  }

  const canClean = classification.kind === 'transient' && stack === 'flutter'
  const canAskAgent = classification.kind === 'code'
  // Special-case: the log contains the "Built …app-debug.apk" line. The
  // APK was actually generated; the failed gate is a false negative left
  // over from a previous run. Offer a one-click "mark as passed" so the
  // operator doesn't have to wait 10+ minutes for a re-build.
  const apkAlreadyBuilt = classification.title === 'Build OK con warnings de cache'

  return (
    <div className="rounded-md border border-danger/40 bg-danger/5 p-3">
      <div className="flex items-center gap-2 text-[12px] text-danger font-medium">
        {gateHumanName(gate.gateType)} — {classification.title}
      </div>
      <div className="mt-1 text-[12px] text-text-soft">{classification.hint}</div>

      {/* Action row: contextual to the error class. */}
      {(canClean || canAskAgent || apkAlreadyBuilt) && !cleanDone && (
        <div className="mt-3 flex flex-wrap gap-2">
          {apkAlreadyBuilt && (
            <Button size="sm" variant="turtle" onClick={markAsPassed} disabled={cleaning || fixing}>
              {cleaning ? 'Marcando…' : '✓ Marcar como passed (el APK existe)'}
            </Button>
          )}
          {canClean && !apkAlreadyBuilt && (
            <Button
              size="sm"
              variant="turtle"
              onClick={runCleanThenRetry}
              disabled={cleaning || fixing}
            >
              {cleaning ? 'Limpiando y reintentando…' : '▶ Reintentar (con limpieza)'}
            </Button>
          )}
          {canClean && apkAlreadyBuilt && (
            <Button
              size="sm"
              variant="ghost"
              onClick={runCleanThenRetry}
              disabled={cleaning || fixing}
            >
              {cleaning ? 'Limpiando…' : 'Reintentar con limpieza (10+ min)'}
            </Button>
          )}
          {canAskAgent && (
            <Button
              size="sm"
              variant="turtle"
              onClick={askAgentToFix}
              disabled={cleaning || fixing}
            >
              {fixing ? 'Lanzando agente…' : '▶ Pedirle al agente que arregle'}
            </Button>
          )}
        </div>
      )}
      {cleanDone && (
        <div className="mt-2 text-[12px] text-turtle">
          ✓ Cache limpia y verificación re-ejecutada. Revisa los gates arriba.
        </div>
      )}
      {cleanError && <div className="mt-2 text-[12px] text-danger">{cleanError}</div>}
      {fixError && <div className="mt-2 text-[12px] text-danger">{fixError}</div>}

      {log.loading && <div className="mt-2 text-[11px] text-text-muted">Cargando log…</div>}
      {content && (
        <>
          <pre className="mt-3 text-[11px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-3 py-2 max-h-[280px] overflow-auto m-0">
            {tail}
          </pre>
          {content.split('\n').length > 20 && (
            <button
              type="button"
              className="mt-2 text-[11px] text-text-muted hover:text-text underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? 'Mostrar menos'
                : `Ver log completo (${content.split('\n').length} líneas)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function lastLines(text: string, n: number): string {
  const lines = text.split(/\r?\n/)
  if (lines.length <= n) return text
  return lines.slice(-n).join('\n')
}

interface ErrorClassification {
  kind: 'transient' | 'code' | 'env' | 'unknown'
  title: string
  hint: string
}

function classifyBuildError(log: string): ErrorClassification {
  if (!log) return { kind: 'unknown', title: 'Error desconocido', hint: 'El log está vacío.' }
  // Special case: Gradle prints exceptions for incremental-cache cleanup
  // but the APK still gets built. If the log contains the success line,
  // it's actually a false negative.
  if (/Built\s+build[\\\/]app[\\\/]outputs[\\\/]flutter-apk[\\\/]app-debug\.apk/i.test(log)) {
    return {
      kind: 'transient',
      title: 'Build OK con warnings de cache',
      hint: 'El APK se generó correctamente al final ("Built …app-debug.apk"). Los errores de java.lang.Exception son del Kotlin incremental cache (problema conocido cuando el Pub Cache vive en otra unidad). El build pasó — reintenta con limpieza para que el gate refleje la realidad.',
    }
  }
  // Transient Gradle / Windows filesystem issues. None of these mean the
  // code is broken — they're caches/locks. The recipe is always the same:
  // `flutter clean` + re-run.
  if (
    /Unable to delete directory|files? open|process has files open|EBUSY/i.test(log) ||
    /Failed to create MD5 hash/i.test(log) ||
    /Accessing unreadable inputs or outputs/i.test(log) ||
    /Cannot access output property/i.test(log) ||
    /state-tracking/i.test(log) ||
    /Could not (resolve|read) (the )?(file|directory) ['"]?[^'"]+build[\\\/]/i.test(log) ||
    /Could not close incremental caches/i.test(log) ||
    /this and base files have different roots/i.test(log) ||
    /Compilation with Kotlin compile daemon was not successful/i.test(log)
  ) {
    return {
      kind: 'transient',
      title: 'Cache de Gradle/Kotlin corrupto',
      hint: 'Gradle no pudo leer/escribir archivos temporales del compilador de Kotlin. No es problema del código del agente — es un bug conocido cuando el Pub Cache vive en otra unidad de disco que el workspace. La solución es correr "flutter clean" en el workspace y reintentar la verificación.',
    }
  }
  if (/command not found|is not recognized|ENOENT|No such file/i.test(log)) {
    return {
      kind: 'env',
      title: 'Falta una herramienta',
      hint: 'El sistema no encuentra una herramienta requerida (Flutter, Node, etc.).',
    }
  }
  // Code errors come last so transient/env wins when both patterns match.
  if (
    /\berror:\s|Undefined name|Type .* is not a subtype|cannot find symbol|expected .* but found/i.test(
      log,
    )
  ) {
    return {
      kind: 'code',
      title: 'Hay errores en el código',
      hint: 'El compilador encontró problemas en lo que escribió el agente.',
    }
  }
  return {
    kind: 'unknown',
    title: 'La verificación no terminó bien',
    hint: 'Revisa el log para detalles.',
  }
}

function gateHumanName(gateType: GateDTO['gateType']): string {
  const map: Record<GateDTO['gateType'], string> = {
    G1_ANALYZE: 'Revisar errores de tipos',
    G2_ARCH: 'Arquitectura',
    G3_BUILD: 'Compilar la app',
    G4_BOOT: 'Arranque',
    G5_FIDELITY: 'Fidelidad de diseño',
    G6_REAL_WORK: 'Trabajo real',
    G7_A11Y: 'Accesibilidad',
  }
  return map[gateType] ?? gateType
}

function RunTranscriptWithRelaunch({
  run,
  editedFiles,
  client,
  taskId,
  stack,
  defaultAgentKind,
  onChanged,
}: {
  run: AgentRunDTO
  editedFiles: string[]
  client: ApiClient
  taskId: string
  stack: ProjectStack
  defaultAgentKind: (typeof AGENT_KINDS)[number]
  onChanged: () => void
}) {
  const [showLauncher, setShowLauncher] = useState(false)
  return (
    <div>
      <RunTranscript run={run} live={false} editedFiles={editedFiles} />
      {!showLauncher ? (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="ghost" onClick={() => setShowLauncher(true)}>
            ▶ Lanzar otro agente
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <LaunchAgentInline
            client={client}
            taskId={taskId}
            stack={stack}
            defaultAgentKind={defaultAgentKind}
            onLaunched={() => {
              setShowLauncher(false)
              onChanged()
            }}
            retryLabel="▶ Lanzar nuevo run"
          />
        </div>
      )}
    </div>
  )
}

function RunTranscript({
  run,
  live,
  client,
  onChanged,
  editedFiles,
}: {
  run: AgentRunDTO
  live: boolean
  client?: ApiClient
  onChanged?: () => void
  editedFiles?: string[]
}) {
  const output = run.output ?? ''
  const empty = output.trim().length === 0
  // Auto-scroll the transcript to the bottom while the run is live and
  // new tokens keep arriving, so the user sees the latest output without
  // having to scroll manually.
  const preRef = useRef<HTMLPreElement>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: auto-scroll only when live flag or output length changes
  useEffect(() => {
    if (live && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [live, output.length])

  async function cancel() {
    if (!client) return
    try {
      await client.agentRuns.cancel(run.id)
      onChanged?.()
    } catch {
      /* ignore */
    }
  }

  const showPhaseTracker = run.agentKind.startsWith('dev')

  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
          <span>{AGENT_LABEL[run.agentKind]}</span>
          <span>·</span>
          <span>{PROVIDER_LABEL[run.provider]}</span>
          {live && (
            <Badge tone="brand" outline>
              en vivo
            </Badge>
          )}
        </div>
        {live && client && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancelar
          </Button>
        )}
      </div>
      {showPhaseTracker && <PhaseTracker output={output} live={live} />}
      {editedFiles && editedFiles.length > 0 && (
        <div className="mb-2 text-[12px] text-turtle border border-turtle/40 rounded-md px-2 py-1">
          ✓ Archivos modificados ({editedFiles.length}):
          <ul className="m-0 mt-1 ml-4 list-disc">
            {editedFiles.slice(0, 8).map((f) => (
              <li key={f} className="font-mono text-[11px]">
                {f}
              </li>
            ))}
            {editedFiles.length > 8 && (
              <li className="text-text-muted">+ {editedFiles.length - 8} más</li>
            )}
          </ul>
        </div>
      )}
      {(() => {
        const fails = failedToolsFromOutput(output)
        if (fails.length === 0) return null
        return (
          <div className="mb-2 text-[12px] text-danger border border-danger/40 rounded-md px-2 py-1">
            ✗ Operaciones fallidas ({fails.length}):
            <ul className="m-0 mt-1 ml-4 list-disc">
              {fails.slice(0, 6).map((f, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: derived fail list from regex scan with no stable id
                <li key={i} className="font-mono text-[11px]">
                  {f.tool} {f.target} — {f.reason}
                </li>
              ))}
              {fails.length > 6 && <li className="text-text-muted">+ {fails.length - 6} más</li>}
            </ul>
          </div>
        )
      })()}
      {empty ? (
        <div className="text-[12px] text-text-muted italic">
          {live ? 'Esperando primer token…' : 'Sin output.'}
        </div>
      ) : (
        <pre
          ref={preRef}
          className="text-[12px] font-mono whitespace-pre-wrap text-text-soft max-h-[420px] overflow-y-auto m-0"
        >
          {output}
          {live && <span className="animate-pulse text-brand">▌</span>}
        </pre>
      )}
    </div>
  )
}

function promptTemplateFor(agentKind: (typeof AGENT_KINDS)[number], stack: ProjectStack): string {
  if (agentKind === 'dev-flutter') {
    return `Implementa esta feature en \`lib/features/<feature>/\` siguiendo el patrón documentado en ARCHITECTURE.md.

Describe brevemente lo que falta del brief de la story (si algo). Si todo está claro, deja el campo vacío y dale Lanzar — el agente lee la story + ARCHITECTURE.md y decide layouts/widgets/repositories.

Detalles opcionales:
- Nombre del feature (folder): <ej: expenses, auth, summary>
- Pantalla a navegar al terminar: <ej: /home>
- Notas extra: <ej: "no agregues animaciones, mantén UI plana">`
  }
  if (agentKind === 'dev-nextjs') {
    return `Implementa esta feature siguiendo ARCHITECTURE.md.

Detalles opcionales:
- Ruta (app/path): <ej: app/expenses/page.tsx>
- Server o Client component: <ej: Server por default; Client si necesita hooks>
- Notas extra: <vacío>`
  }
  if (agentKind === 'dev-vite-react' || agentKind === 'dev-node') {
    return 'Implementa esta feature siguiendo ARCHITECTURE.md. Si todo está claro, deja vacío y dale Lanzar.'
  }
  if (agentKind === 'dev' && stack === 'flutter') {
    return `Edita 05-build/app/lib/main.dart (o crea archivos nuevos en lib/screens/).
Implementa la funcionalidad pedida en la story de esta tarea.

Detalles concretos (rellena tú):
- Pantalla / widget: <nombre>
- Campos / inputs: <ej: TextField email, TextField password, Button entrar>
- Navegación: <a qué pantalla va al terminar>
- Estilo: usa Material 3 (ThemeData del scaffold).

Cuando termines, corre 'flutter analyze' para verificar.`
  }
  if (agentKind === 'dev' && (stack === 'nextjs' || stack === 'vite-react')) {
    return `Implementa la funcionalidad pedida en la story.

Detalles concretos (rellena tú):
- Archivo principal: src/<ruta>.tsx
- Componente / función: <nombre>
- Props / API: <descríbelo>
- Tests: <si aplica>

Cuando termines, corre 'pnpm typecheck'.`
  }
  if (agentKind === 'dev' && stack === 'node') {
    return `Implementa lo pedido. Archivo principal: src/<path>.ts.
Exporta lo que se necesita y corre 'pnpm typecheck' antes de declarar listo.`
  }
  if (agentKind === 'arch' || agentKind === 'tech_lead') {
    if (stack === 'flutter') {
      return `Scaffolda este proyecto Flutter desde cero (o complementa lo que ya existe).

Sugerencias por defecto (ajusta si tienes preferencia):
- State mgmt: Riverpod
- Persistencia local: sqflite (sin backend)
- Arquitectura: features por carpeta — lib/features/<feature>/{data,domain,presentation}
- Tema: Material 3, light + dark

Pasos:
1) flutter create --org com.tortugaos --project-name <slug> --platforms=android,web 05-build/app
2) Agrega deps al pubspec.yaml (flutter_riverpod, sqflite, path_provider, intl, fl_chart)
3) Crea lib/main.dart con ProviderScope y un Material App básico
4) Crea las carpetas base en lib/features/
5) Escribe ARCHITECTURE.md en la raíz del workspace con todas las decisiones`
    }
    return `Scaffolda este proyecto según el stack del proyecto.
Decide stack, layout, dependencias, y deja ARCHITECTURE.md en la raíz del workspace.`
  }
  if (agentKind === 'designer') {
    return `Describe la UI propuesta para esta tarea en 03-design/design-approval.md.
Incluye: layout, componentes, estados, edge cases. No tocas código.`
  }
  if (agentKind === 'qa') {
    return `Revisa el código contra los acceptance criteria de la story.
Lista defects con file:line. No modificas código.`
  }
  return 'Describe en una o dos frases qué quieres que haga el agente.'
}

// Only counts files where the tool_result confirmed success. The CLI
// runner emits `[tool:<name> OK] <path>` on success and
// `[tool:<name> FAILED] <path> — <reason>` on failure (permissions denied,
// path not found, etc.). Older runs may still have the legacy format
// `[tool:<name>] <path>` without status; we keep parsing those too so
// the UI doesn't lose history, but they will all be re-emitted with
// status the next time the agent runs.
const ALREADY_IMPLEMENTED_PATTERNS: RegExp[] = [
  /all\s+gates?\s+green/i,
  /\bya\s+(est[aá]|se\s+encuentra)\s+implementad[ao]/i,
  /\bya\s+existe[ns]?\b/i,
  /already\s+(implemented|exists?|in\s+place|present)/i,
  /no\s+(changes?|edits?)\s+(needed|required)/i,
  /\bsin\s+cambios?\b/i,
  /feature\s+is\s+fully\s+implemented/i,
  /nothing\s+to\s+(do|change|implement)/i,
]

function outputLooksAlreadyImplemented(output: string): boolean {
  if (!output) return false
  const tail = output.slice(-4000)
  return ALREADY_IMPLEMENTED_PATTERNS.some((re) => re.test(tail))
}

function editedFilesFromOutput(output: string): string[] {
  const files = new Set<string>()
  const re = /\[tool:(Edit|Write|NotebookEdit)(?:\s+OK)?\]\s+([^\n—]+)/g
  while (true) {
    const m = re.exec(output)
    if (m === null) break
    const path = m[2]
    if (path) files.add(path.trim())
  }
  return Array.from(files)
}

function failedToolsFromOutput(
  output: string,
): Array<{ tool: string; target: string; reason: string }> {
  const fails: Array<{ tool: string; target: string; reason: string }> = []
  const re = /\[tool:([A-Za-z]+)\s+FAILED\]\s+([^—\n]*)(?:—\s*([^\n]+))?/g
  while (true) {
    const m = re.exec(output)
    if (m === null) break
    fails.push({
      tool: m[1] ?? '',
      target: (m[2] ?? '').trim(),
      reason: (m[3] ?? '').trim() || 'sin detalle',
    })
  }
  return fails
}

// While a dev agent runs, the operator only sees a wall of token output.
// We parse the `[tool:Edit OK] <path>` lines that the runner emits and
// classify each path into one of 8 phases (model → repo → providers →
// screen → widget-test → golden-test → integration-test → other), then
// render a row of dots so the operator knows at a glance whether the
// agent is still in "writing code" land or already moved into "writing
// tests" land. Pure heuristic on the path string — the agent does NOT
// need to announce phases explicitly.

const PHASE_IDS = [
  'model',
  'repo',
  'providers',
  'screen',
  'widget-test',
  'golden-test',
  'integration-test',
  'other',
] as const

type PhaseId = (typeof PHASE_IDS)[number]

const PHASE_LABEL: Record<PhaseId, string> = {
  model: 'Modelo',
  repo: 'Repositorio',
  providers: 'Providers',
  screen: 'Pantalla',
  'widget-test': 'Widget test',
  'golden-test': 'Golden test',
  'integration-test': 'Integration',
  other: 'Otros',
}

function phaseFromPath(rawPath: string): PhaseId {
  const p = rawPath.toLowerCase().replace(/\\/g, '/')
  if (p.includes('integration_test/')) return 'integration-test'
  if (p.includes('_golden_test.dart') || p.includes('/goldens/')) return 'golden-test'
  if (p.includes('_screen_test.dart')) return 'widget-test'
  if (p.includes('/test/') && p.endsWith('_test.dart')) {
    // Generic test file under test/ that isn't golden/widget by name —
    // most likely a unit (model or repository). The tracker is happy to
    // bucket both unit kinds under whichever the agent is currently
    // touching: heuristic on the file name.
    if (p.includes('repository_test') || p.includes('_repo_test')) return 'repo'
    if (p.includes('model_test')) return 'model'
    // Default unit → bucket as widget-test so the dot shows progress in
    // SOME test phase; misclassification is preferable to silence.
    return 'widget-test'
  }
  if (p.includes('/data/') && p.endsWith('.dart')) return 'repo'
  if (p.includes('/domain/') && p.endsWith('.dart')) return 'model'
  if (p.includes('_providers.dart') || p.includes('/providers.dart')) return 'providers'
  if (p.includes('_screen.dart') || p.includes('/presentation/')) return 'screen'
  if (p.includes('_repository.dart') || p.includes('_repo.dart')) return 'repo'
  if (p.endsWith('_model.dart')) return 'model'
  return 'other'
}

type PhaseStatus = 'pending' | 'active' | 'done'

interface PhaseState {
  id: PhaseId
  status: PhaseStatus
  files: string[]
}

/**
 * Walk the run output line by line. Each `[tool:Edit OK] <path>` advances
 * the phase that path belongs to. The LAST touched phase is `active`
 * while the run is live, every phase that has ever been touched is
 * `done` once the run closes.
 */
function derivePhases(output: string, live: boolean): PhaseState[] {
  const filesByPhase = new Map<PhaseId, string[]>()
  for (const id of PHASE_IDS) filesByPhase.set(id, [])
  const re = /\[tool:(Edit|Write|NotebookEdit)(?:\s+OK)?\]\s+([^\n—]+)/g
  let lastTouched: PhaseId | null = null
  while (true) {
    const m = re.exec(output)
    if (m === null) break
    const path = (m[2] ?? '').trim()
    if (!path) continue
    const phase = phaseFromPath(path)
    const arr = filesByPhase.get(phase)!
    if (!arr.includes(path)) arr.push(path)
    lastTouched = phase
  }
  return PHASE_IDS.map<PhaseState>((id) => {
    const files = filesByPhase.get(id)!
    const touched = files.length > 0
    let status: PhaseStatus = 'pending'
    if (touched) status = live && id === lastTouched ? 'active' : 'done'
    return { id, status, files }
  })
}

function PhaseTracker({ output, live }: { output: string; live: boolean }) {
  const phases = useMemo(() => derivePhases(output, live), [output, live])
  const anyTouched = phases.some((p) => p.status !== 'pending')
  if (!anyTouched) return null
  // Hide 'other' if it's empty so the tracker doesn't look cluttered.
  const visible = phases.filter((p) => p.id !== 'other' || p.files.length > 0)
  return (
    <div className="mb-3 rounded-md border border-border bg-bg/40 px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5">
        Progreso por fase
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {visible.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1.5 text-[11px] font-mono"
            title={p.files.join('\n') || 'pendiente'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                p.status === 'done'
                  ? 'bg-turtle'
                  : p.status === 'active'
                    ? 'bg-brand animate-pulse'
                    : 'bg-border'
              }`}
            />
            <span className={p.status === 'pending' ? 'text-text-muted' : 'text-text'}>
              {PHASE_LABEL[p.id]}
            </span>
            {p.files.length > 0 && <span className="text-text-dim">({p.files.length})</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

interface QaVerdictParsed {
  verdict: 'APPROVED' | 'REJECTED' | null
  criteria: string
  defects: string
  notes: string
  raw: string
}

function QaVerdictMissing({
  run,
  client,
  taskId,
  editedFiles,
  onChanged,
}: {
  run: AgentRunDTO
  client: ApiClient
  taskId: string
  editedFiles: string[]
  onChanged: () => void
}) {
  const [showRaw, setShowRaw] = useState(false)
  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3 space-y-3">
      <div className="text-[12px] text-text">
        El agente revisor terminó (run{' '}
        <span className="font-mono text-[11px]">{run.id.slice(0, 8)}</span>) pero no encontré{' '}
        <span className="font-mono">qa-verdict.json</span> en
        <span className="font-mono"> 05-build/_agent-runs/</span> y tampoco un bloque
        <span className="font-mono"> ## Verdict</span> en el output. No puedo derivar
        APPROVED/REJECTED automáticamente.
      </div>
      <div className="flex flex-wrap gap-2 justify-end">
        <Button size="sm" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Ocultar output' : 'Ver output del agente'}
        </Button>
        <LaunchQaInline
          client={client}
          taskId={taskId}
          editedFiles={editedFiles}
          onLaunched={onChanged}
        />
      </div>
      {showRaw && (
        <pre className="text-[11px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-3 py-2 max-h-[280px] overflow-auto">
          {run.output ?? '(sin output)'}
        </pre>
      )}
    </div>
  )
}

function LaunchQaInline({
  client,
  taskId,
  editedFiles,
  onLaunched,
}: {
  client: ApiClient
  taskId: string
  editedFiles: string[]
  onLaunched: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function launch() {
    setBusy(true)
    setError(null)
    try {
      const filesList =
        editedFiles.length > 0
          ? `Archivos modificados por el agente dev:\n${editedFiles.map((f) => `- ${f}`).join('\n')}`
          : 'El agente dev no reportó archivos modificados explícitamente; revisa el diff completo.'
      const extraPrompt = `Audita esta tarea. Lee la story y ARCHITECTURE.md. Verifica cada acceptance criterion contra el código. Corre 'flutter analyze' si aplica.\n\n**OBLIGATORIO**: al terminar, escribe el veredicto estructurado en el archivo \`05-build/_agent-runs/${'${RUN_ID}'}-verdict.json\` (reemplaza \${RUN_ID} por tu propio runId) con este shape exacto:\n\n\`\`\`json\n{\n  "verdict": "APPROVED" | "REJECTED",\n  "acceptanceCriteria": "...",\n  "defects": "...",\n  "notes": "..."\n}\n\`\`\`\n\nAdicionalmente puedes incluir en tu output markdown las secciones ## Verdict / ## Acceptance criteria / ## Defects / ## Notes como respaldo. Sin el archivo JSON el wizard no puede continuar.\n\n${filesList}`
      await client.agentRuns.create({
        taskId,
        agentKind: 'qa',
        provider: 'claude-cli',
        extraPrompt,
      })
      onLaunched()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      <div className="text-[12px] text-text-soft">
        Un agente revisor leerá el código + acceptance criteria y emitirá un veredicto
        (APPROVED/REJECTED) con la lista de defectos. No modifica nada.
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      <div className="mt-3 flex justify-end">
        <Button variant="turtle" onClick={launch} disabled={busy}>
          {busy ? 'Lanzando…' : '▶ Lanzar revisión QA'}
        </Button>
      </div>
    </div>
  )
}

function QaVerdictCard({
  run,
  verdict,
  client,
  taskId,
  editedFiles,
  defaultAgentKind,
  manualTestKey,
  onChanged,
}: {
  run: AgentRunDTO
  verdict: QaVerdictParsed
  client: ApiClient
  taskId: string
  editedFiles: string[]
  defaultAgentKind: (typeof AGENT_KINDS)[number]
  manualTestKey: string
  onChanged: () => void
}) {
  const [showRaw, setShowRaw] = useState(false)
  const [relaunching, setRelaunching] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Two-step "ask dev to fix": first click reveals an editable textarea
  // pre-filled with the QA defects + a slot for runtime errors the
  // operator may have seen on the emulator (these are NOT in the QA
  // verdict because QA is read-only). Second click on "Lanzar" creates
  // the agent run with the final text.
  const [showFixDraft, setShowFixDraft] = useState(false)
  const defaultFixBrief = `# Fix iteration — orden estricto\n\nQA rechazó la tarea anterior. Tu trabajo en esta iteración es cerrar **cada defecto del bloque "## Defectos QA" abajo** y luego validar con flutter analyze + flutter test. NO inicies trabajo nuevo, NO refactorices fuera del alcance, NO cambies AC.\n\n## Reglas duras\n1. Lee TODA la sección "## Defectos QA" antes de tocar nada.\n2. Por cada bullet de defectos, abre EL archivo+línea citados y haz el cambio mínimo que lo cierra. Si el defecto es "archivo inexistente", créalo con contenido real (no expect(true, isTrue)).\n3. Después de aplicar TODOS los fixes:\n   - flutter analyze --no-pub  → debe pasar sin warnings.\n   - flutter test test/  → todos los tests del feature deben correr y pasar. Si un test no se ejecuta, revisa por qué (imports rotos, sintaxis, dependencias faltantes en pubspec).\n4. Si surge un defecto NO listado aquí pero que descubres mientras arreglas (ej. test que rompe por un bug paralelo), arréglalo también — el objetivo es \`flutter analyze\` + \`flutter test\` en verde.\n5. En el FINAL REPORT incluye una sección "## Defectos atendidos" con cada bullet del QA seguido de file:line del fix que aplicaste. Si no atendiste alguno, explica por qué (raro: no debería pasar).\n\n## Defectos QA\n\n\`\`\`\n${verdict.defects}\n\`\`\`\n\n## Notas del QA\n\n\`\`\`\n${verdict.notes || '(sin notas)'}\n\`\`\`\n\n## Errores en runtime que vi en el emulador (opcional)\n(Pega aquí excepciones que la app lanzó al probar. Ej. "AuthApiException: Anonymous sign-ins are disabled". Si no viste errores, borra este bloque entero.)\n`
  const [fixBrief, setFixBrief] = useState(defaultFixBrief)

  const approved = verdict.verdict === 'APPROVED'

  async function relaunchQa() {
    setRelaunching(true)
    setError(null)
    const y = typeof window !== 'undefined' ? window.scrollY : 0
    try {
      const filesList =
        editedFiles.length > 0
          ? `Archivos modificados:\n${editedFiles.map((f) => `- ${f}`).join('\n')}`
          : ''
      await client.agentRuns.create({
        taskId,
        agentKind: 'qa',
        provider: 'claude-cli',
        extraPrompt: `Re-audita la tarea desde cero. Devuelve el veredicto en el formato exacto.\n\n${filesList}`,
      })
      onChanged()
      if (typeof window !== 'undefined') {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior })
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRelaunching(false)
    }
  }

  async function launchDevFix() {
    setFixing(true)
    setError(null)
    const y = typeof window !== 'undefined' ? window.scrollY : 0
    try {
      await client.agentRuns.create({
        taskId,
        agentKind: defaultAgentKind,
        provider: 'claude-cli',
        extraPrompt: fixBrief.trim(),
      })
      if (manualTestKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(manualTestKey)
      }
      setShowFixDraft(false)
      onChanged()
      if (typeof window !== 'undefined') {
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' as ScrollBehavior })
        })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setFixing(false)
    }
  }

  const borderTone = approved ? 'border-turtle/40 bg-turtle/5' : 'border-danger/40 bg-danger/5'
  const titleTone = approved ? 'text-turtle' : 'text-danger'

  return (
    <div className={`rounded-md border ${borderTone} p-3`}>
      <div className={`flex items-center gap-2 text-[13px] font-medium ${titleTone}`}>
        {approved ? '✓ QA aprobó' : '✗ QA rechazó'}
        <span className="text-[11px] font-mono text-text-muted">
          · tokens {run.tokensIn}/{run.tokensOut} · ${(run.costCents / 100).toFixed(2)}
        </span>
      </div>

      {verdict.criteria && (
        <div className="mt-3">
          <Eyebrow>Acceptance criteria</Eyebrow>
          <pre className="mt-1 text-[12px] font-mono whitespace-pre-wrap text-text-soft m-0">
            {verdict.criteria}
          </pre>
        </div>
      )}

      {verdict.defects && verdict.defects.toLowerCase() !== 'none' && verdict.defects !== '-' && (
        <div className="mt-3">
          <Eyebrow>Defectos</Eyebrow>
          <pre className="mt-1 text-[12px] font-mono whitespace-pre-wrap text-text-soft m-0">
            {verdict.defects}
          </pre>
        </div>
      )}

      {verdict.notes && (
        <div className="mt-3">
          <Eyebrow>Notas</Eyebrow>
          <pre className="mt-1 text-[12px] font-mono whitespace-pre-wrap text-text-soft m-0">
            {verdict.notes}
          </pre>
        </div>
      )}

      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}

      {!approved && showFixDraft && (
        <div className="mt-3 rounded-md border border-border bg-bg-alt p-3">
          <div className="text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1">
            Brief para el agente (editable)
          </div>
          <textarea
            className="w-full bg-bg border border-border rounded-md px-2 py-1.5 text-[12px] text-text font-mono leading-snug min-h-[180px] focus:outline-none focus:border-brand"
            value={fixBrief}
            onChange={(e) => setFixBrief(e.target.value)}
          />
          <div className="mt-2 flex gap-2 justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowFixDraft(false)}
              disabled={fixing}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="turtle"
              onClick={launchDevFix}
              disabled={fixing || fixBrief.trim().length === 0}
            >
              {fixing ? 'Lanzando dev…' : '▶ Lanzar agente con este brief'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2 justify-end">
        {!approved && !showFixDraft && (
          <Button
            size="sm"
            variant="turtle"
            onClick={() => setShowFixDraft(true)}
            disabled={fixing || relaunching}
          >
            ▶ Pedir al agente que arregle
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={relaunchQa} disabled={fixing || relaunching}>
          {relaunching ? '…' : '↻ Re-auditar'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Ocultar transcript' : 'Ver transcript completo'}
        </Button>
      </div>

      {showRaw && (
        <pre className="mt-3 text-[11px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-3 py-2 max-h-[280px] overflow-auto m-0">
          {verdict.raw}
        </pre>
      )}
    </div>
  )
}

function ApproveRejectInline({
  client,
  taskId,
  manualTestKey,
  needsSubmit = false,
  onChanged,
}: {
  client: ApiClient
  taskId: string
  manualTestKey?: string
  needsSubmit?: boolean
  onChanged: () => void
}) {
  const [showReject, setShowReject] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ensureInQa() {
    if (!needsSubmit) return
    try {
      await client.tasks.submitQa(taskId)
      if (manualTestKey && typeof window !== 'undefined') {
        window.localStorage.removeItem(manualTestKey)
      }
    } catch {
      /* may already be in 'qa'; ignore */
    }
  }

  async function approve() {
    setBusy(true)
    setError(null)
    try {
      await ensureInQa()
      await client.tasks.approve(taskId, { closedByRole: 'qa', notes: undefined })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    if (!notes.trim()) {
      setError('Escribe el motivo del rechazo')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await ensureInQa()
      await client.tasks.reject(taskId, { closedByRole: 'qa', notes: notes.trim() })
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg-alt p-3">
      {!showReject ? (
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => setShowReject(true)} disabled={busy}>
            ✗ Rechazar
          </Button>
          <Button variant="turtle" onClick={approve} disabled={busy}>
            {busy ? '…' : '✓ Aprobar'}
          </Button>
        </div>
      ) : (
        <div>
          <TextField
            label="¿Por qué se rechaza?"
            placeholder="Describe qué falta o qué está mal"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
          <div className="mt-3 flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setShowReject(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={reject} disabled={busy}>
              {busy ? '…' : 'Confirmar rechazo'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function IterationHistory({ iterations }: { iterations: IterationDTO[] }) {
  if (iterations.length === 0) return null
  return (
    <div>
      <Eyebrow>Iteraciones</Eyebrow>
      <div className="mt-2 space-y-2">
        {iterations.map((it) => (
          <div
            key={it.id}
            className="rounded-md border border-border bg-bg-alt px-3 py-2 text-[12px]"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-text-muted">n={it.n}</span>
              <Badge tone={outcomeTone(it.outcome)} outline>
                {humanizeOutcome(it.outcome)}
              </Badge>
            </div>
            <div className="mt-1 text-[11px] text-text-muted font-mono">
              {new Date(it.startedAt).toLocaleString()}
              {it.closedAt && ` → ${new Date(it.closedAt).toLocaleString()}`}
            </div>
            {it.notes && <div className="mt-1 text-text-soft italic">"{it.notes}"</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Disclosure({
  label,
  count,
  children,
}: {
  label: string
  count: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-text-muted">{open ? '▾' : '▸'}</span>
          <span className="text-[13px] font-medium text-text">{label}</span>
          <span className="text-[11px] text-text-muted">({count})</span>
        </div>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  )
}

function humanizeTaskTitle(type: string, owner: string): string {
  const typeLabel: Record<string, string> = {
    impl: 'Implementar',
    design: 'Diseñar',
    review: 'Revisar',
    spec: 'Especificar',
    qa: 'Revisar QA',
    bugfix: 'Arreglar bug',
  }
  return `${typeLabel[type] ?? type} (responsable: ${owner})`
}

function humanizeStatus(status: string): string {
  const map: Record<string, string> = {
    pending: 'Por empezar',
    in_progress: 'En curso',
    qa: 'En revisión',
    approved: 'Aprobada',
    rejected: 'Rechazada',
    rework: 'Requiere retrabajo',
  }
  return map[status] ?? status
}

function humanizeOutcome(outcome: IterationDTO['outcome']): string {
  if (outcome == null) return 'abierta'
  const map: Record<NonNullable<IterationDTO['outcome']>, string> = {
    approved: 'aprobada',
    rejected: 'rechazada',
    rework_requested: 'retrabajo',
    reopened: 'reabierta',
  }
  return map[outcome]
}

function statusTone(status: string): 'neutral' | 'brand' | 'turtle' | 'warning' | 'danger' {
  const map: Record<string, 'neutral' | 'brand' | 'turtle' | 'warning' | 'danger'> = {
    pending: 'neutral',
    in_progress: 'brand',
    qa: 'warning',
    approved: 'turtle',
    rejected: 'danger',
    rework: 'warning',
  }
  return map[status] ?? 'neutral'
}

function outcomeTone(
  outcome: IterationDTO['outcome'],
): 'neutral' | 'turtle' | 'warning' | 'danger' {
  if (outcome == null) return 'warning'
  const map: Record<NonNullable<IterationDTO['outcome']>, 'turtle' | 'warning' | 'danger'> = {
    approved: 'turtle',
    rejected: 'danger',
    rework_requested: 'warning',
    reopened: 'warning',
  }
  return map[outcome]
}

function countDetails(
  runs: AgentRunDTO[] | null | undefined,
  gates: GateDTO[] | null | undefined,
  iterations: IterationDTO[] | null | undefined,
): number {
  return (runs?.length ?? 0) + (gates?.length ?? 0) + (iterations?.length ?? 0)
}

function StepAckPanel({
  client,
  taskId,
  stepId,
  label,
  ack,
  canAck,
  onChanged,
}: {
  client: ApiClient
  taskId: string
  stepId: string
  label: string
  ack: StepAckDTO | null
  canAck: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function setAck(kind: 'ok' | 'fail') {
    setBusy(true)
    setError(null)
    try {
      await client.tasks.upsertStepAck(taskId, {
        stepId,
        ack: kind,
        ackedByRole: 'tech_lead',
      })
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  async function undo() {
    setBusy(true)
    setError(null)
    try {
      await client.tasks.deleteStepAck(taskId, stepId)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (ack?.ack === 'ok') {
    return (
      <div className="mt-3 rounded-md border border-turtle/40 bg-turtle/5 p-3 flex items-center justify-between gap-2">
        <span className="text-[12px] text-turtle">✓ {label} — confirmado por ti</span>
        <Button size="sm" variant="ghost" onClick={undo} disabled={busy}>
          {busy ? '…' : '↩ Deshacer'}
        </Button>
      </div>
    )
  }

  if (ack?.ack === 'fail') {
    return (
      <div className="mt-3 rounded-md border border-danger/40 bg-danger/5 p-3 flex items-center justify-between gap-2">
        <span className="text-[12px] text-danger">✗ {label} — marcado como falla por ti</span>
        <Button size="sm" variant="ghost" onClick={undo} disabled={busy}>
          {busy ? '…' : '↩ Deshacer'}
        </Button>
      </div>
    )
  }

  if (!canAck) return null

  return (
    <div className="mt-3 rounded-md border border-warning/40 bg-warning/5 p-3 flex items-center justify-between gap-2 flex-wrap">
      <span className="text-[12px] text-text">⚠ Pendiente tu confirmación.</span>
      <div className="flex items-center gap-2">
        {error && <span className="text-[11px] text-danger">{error}</span>}
        <Button size="sm" variant="ghost" onClick={() => setAck('fail')} disabled={busy}>
          ✗ Marcar falla
        </Button>
        <Button size="sm" variant="turtle" onClick={() => setAck('ok')} disabled={busy}>
          {busy ? '…' : '✓ Marcar OK'}
        </Button>
      </div>
    </div>
  )
}

function GatesSummary({
  client,
  taskId,
  stack,
  analyzeGate,
  buildGate,
  realWorkGate,
  fidelityGate,
  bootGate,
  runningGates,
}: {
  client: ApiClient
  taskId: string
  stack: ProjectStack
  analyzeGate: GateDTO | null
  buildGate: GateDTO | null
  realWorkGate: GateDTO | null
  fidelityGate: GateDTO | null
  bootGate: GateDTO | null
  runningGates: GateType[]
}) {
  const [cmds, setCmds] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    void client.gates
      .preview(stack)
      .then((res) => {
        if (!alive) return
        const m: Record<string, string> = {}
        for (const g of res.gates) {
          if (g.supported) m[g.type] = `${g.cmd} ${g.args.join(' ')}`
        }
        setCmds(m)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, stack])

  const rows: Array<{ type: GateType; label: string; gate: GateDTO | null }> = [
    { type: 'G1_ANALYZE', label: 'Revisar errores de tipos', gate: analyzeGate },
    { type: 'G3_BUILD', label: 'Compilar la app', gate: buildGate },
    { type: 'G6_REAL_WORK', label: 'Correr unit + widget tests', gate: realWorkGate },
    { type: 'G5_FIDELITY', label: 'Correr golden tests (UI snapshots)', gate: fidelityGate },
    { type: 'G4_BOOT', label: 'Boot smoke en emulador (integration)', gate: bootGate },
  ]

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <GateRow
          key={r.type}
          client={client}
          taskId={taskId}
          gateType={r.type}
          label={r.label}
          gate={r.gate}
          cmd={cmds[r.type] ?? null}
          isRunning={runningGates.includes(r.type)}
        />
      ))}
    </div>
  )
}

function GateRow({
  client,
  taskId,
  gateType,
  label,
  gate,
  cmd,
  isRunning,
}: {
  client: ApiClient
  taskId: string
  gateType: GateType
  label: string
  gate: GateDTO | null
  cmd: string | null
  isRunning: boolean
}) {
  const dbStatus = gate?.status ?? 'pending'
  const effectiveStatus: 'running' | 'passed' | 'failed' | 'skipped' | 'pending' =
    dbStatus === 'pending' && isRunning ? 'running' : dbStatus
  const tone =
    effectiveStatus === 'passed'
      ? 'turtle'
      : effectiveStatus === 'failed'
        ? 'danger'
        : effectiveStatus === 'skipped'
          ? 'neutral'
          : effectiveStatus === 'running'
            ? 'brand'
            : 'warning'
  const icon =
    effectiveStatus === 'passed'
      ? '✓'
      : effectiveStatus === 'failed'
        ? '✗'
        : effectiveStatus === 'skipped'
          ? '—'
          : effectiveStatus === 'running'
            ? '…'
            : '○'

  const [open, setOpen] = useState(false)
  const userToggledRef = useRef(false)
  const [log, setLog] = useState<string>('')
  const offsetRef = useRef(0)
  const [repairBusy, setRepairBusy] = useState(false)
  const [repairError, setRepairError] = useState<string | null>(null)
  const [repairRunId, setRepairRunId] = useState<string | null>(null)

  useEffect(() => {
    if (!userToggledRef.current) {
      setOpen(effectiveStatus === 'running')
    }
  }, [effectiveStatus])

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick owns its own offset via ref
  useEffect(() => {
    if (!open) return
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        const res = await client.gates.tailLog(taskId, gateType, offsetRef.current)
        if (cancelled) return
        offsetRef.current = res.size
        if (res.chunk) setLog((prev) => prev + res.chunk)
        if (!res.done) {
          timer = setTimeout(tick, 1200)
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, 2000)
      }
    }
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(tick, 50)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gateType, taskId, effectiveStatus])

  return (
    <div className="rounded-md border border-border bg-bg-alt p-2">
      <button
        type="button"
        onClick={() => {
          userToggledRef.current = true
          setOpen((v) => !v)
        }}
        className="w-full flex items-center gap-2 text-left"
      >
        <Badge tone={tone} outline>
          {icon}
        </Badge>
        <span className="text-[13px] text-text flex-1 truncate">{label}</span>
        {cmd && (
          <span className="text-[11px] font-mono text-text-muted truncate max-w-[260px]">
            $ {cmd}
          </span>
        )}
        <span className="text-text-muted text-[11px]">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <pre className="mt-2 text-[11px] font-mono whitespace-pre-wrap text-text-soft max-h-[260px] overflow-y-auto m-0">
            {log ||
              (effectiveStatus === 'pending'
                ? '(no se ha ejecutado todavía)'
                : 'Esperando salida…')}
          </pre>
          {effectiveStatus === 'failed' && !repairRunId && (
            <div className="mt-2 flex items-center justify-end gap-2">
              {repairError && <span className="text-[11px] text-danger">{repairError}</span>}
              <Button
                size="sm"
                variant="turtle"
                disabled={repairBusy}
                onClick={async () => {
                  setRepairBusy(true)
                  setRepairError(null)
                  try {
                    const run = await client.gates.repair(taskId, {
                      gateType,
                      gateLabel: label,
                      log,
                    })
                    setRepairRunId(run.id)
                  } catch (err) {
                    setRepairError((err as Error).message)
                  } finally {
                    setRepairBusy(false)
                  }
                }}
              >
                {repairBusy ? '…' : '🤖 Reparar con agente'}
              </Button>
            </div>
          )}
          {repairRunId && (
            <div className="mt-2">
              <CoworkerLiveView
                client={client}
                runId={repairRunId}
                onFinished={(succeeded) => {
                  setRepairRunId(null)
                  if (succeeded) {
                    setLog('')
                    offsetRef.current = 0
                  }
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function RereverifyInline({
  client,
  taskId,
  stack,
  onChanged,
}: {
  client: ApiClient
  taskId: string
  stack: ProjectStack
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function rerun() {
    setBusy(true)
    setError(null)
    try {
      const gatesToRun: GateType[] = ['G1_ANALYZE', 'G3_BUILD', 'G6_REAL_WORK', 'G5_FIDELITY']
      if (stack === 'flutter') {
        try {
          const { devices } = await client.preview.listDevices()
          if (devices.some((d) => d.state === 'device')) gatesToRun.push('G4_BOOT')
        } catch {
          /* no device → skip G4 */
        }
      }
      await client.gates.reset(taskId, gatesToRun)
      onChanged()
      await client.gates.runForTask(taskId, { stack, gates: gatesToRun })
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 flex items-center justify-end gap-3">
      {error && <span className="text-[11px] text-danger">{error}</span>}
      <Button size="sm" variant="ghost" onClick={rerun} disabled={busy}>
        {busy ? '… Re-verificando' : '↩ Re-verificar'}
      </Button>
    </div>
  )
}

function ReopenInline({
  client,
  taskId,
  wasApproved,
  onChanged,
}: {
  client: ApiClient
  taskId: string
  wasApproved: boolean
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reopen() {
    setBusy(true)
    setError(null)
    try {
      await client.tasks.reopen(taskId, {
        closedByRole: 'tech_lead',
        notes: notes.trim() || undefined,
      })
      onChanged()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          ↩ Revertir {wasApproved ? 'aprobación' : 'rechazo'}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
      <div className="text-[12px] text-text">
        Revertir abre una nueva iteración y devuelve la tarea a <code>in_progress</code>. Si esta
        era la última tarea aprobada de su story / phase, esos también vuelven a estar en curso.
      </div>
      <div className="mt-3">
        <TextField
          label="Razón (opcional)"
          placeholder="Por qué reabres la tarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
        />
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" variant="turtle" onClick={reopen} disabled={busy}>
          {busy ? '…' : '↩ Revertir'}
        </Button>
      </div>
    </div>
  )
}
