import type { ApiClient } from '@tortuga-os/api-client'
import type { StoryDTO, TaskDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Stack, TextField } from '@tortuga-os/ui'
import { useCallback, useRef, useState } from 'react'
import { CostReport } from './CostReport'
import { DesignPanel } from './DesignPanel'
import { DiscoveryChat } from './DiscoveryChat'
import { ExpensesPanel } from './ExpensesPanel'
import { ProjectEnvsPanel } from './ProjectEnvsPanel'
import { ProjectMcpsPanel } from './ProjectMcpsPanel'
import { ProjectSkillsPanel } from './ProjectSkillsPanel'
import { SecretsPanel } from './SecretsPanel'
import { useAsyncData } from './useAsyncData'

export interface ProjectDetailProps {
  client: ApiClient
  projectCode: string
  refreshKey?: number
  onChanged?: () => void
  /**
   * Notify the shell that the operator picked a task. The shell switches
   * to a dedicated TaskDetailPage view (full-width), keeping ProjectDetail
   * free to render only the list.
   */
  onSelectTask?: (taskId: string) => void
}

interface TaskWithStory extends TaskDTO {
  story: StoryDTO
}

export function ProjectDetail({
  client,
  projectCode,
  refreshKey = 0,
  onChanged,
  onSelectTask,
}: ProjectDetailProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [showDiscovery, setShowDiscovery] = useState(false)
  const [showCost, setShowCost] = useState(false)

  const projectQuery = useAsyncData(
    () => client.projects.getByCode(projectCode),
    [client, projectCode, refreshKey],
  )

  const stories = useAsyncData(
    () => client.stories.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )

  const allTasks = useAsyncData<TaskWithStory[]>(async () => {
    const ss = stories.data ?? []
    if (ss.length === 0) return []
    const lists = await Promise.all(
      ss.map((s) =>
        client.tasks.listForStory(s.id).then((ts) => ts.map((t) => ({ ...t, story: s }))),
      ),
    )
    return lists.flat()
  }, [client, stories.data, refreshKey])

  const tasks = allTasks.data ?? []
  // T0 architecture gate: the materialization step inserts a single
  // `arch` task per project. Implementation tasks should not start
  // until that one is approved (so ARCHITECTURE.md exists on disk).

  if (projectQuery.error)
    return (
      <Card>
        <div className="text-[13px] text-danger">Error: {projectQuery.error}</div>
      </Card>
    )
  if (projectQuery.loading || !projectQuery.data)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando…</div>
      </Card>
    )

  const p = projectQuery.data
  // The project's concrete stack (e.g. 'flutter-supabase') is persisted
  // on the project once the scaffold runs. Until then, fall back to a
  // best-effort guess from the code prefix so gates can still pick a
  // command. After scaffold, p.stack is authoritative.
  const projectStack = p.stack && p.stack !== 'unknown' ? p.stack : null
  const stack: 'flutter' | 'node' = projectStack?.startsWith('flutter')
    ? 'flutter'
    : projectCode.toUpperCase().startsWith('FLUTTER')
      ? 'flutter'
      : 'node'

  return (
    <Stack gap="lg">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="font-display font-medium text-[26px] tracking-tighter-2 m-0">
                {p.code}
              </h2>
              <span className="text-[15px] text-text-soft">· {p.name}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-text-muted">
              <span>{p.client.name}</span>
              <span className="text-text-dim">·</span>
              <span className="font-mono">{stack}</span>
            </div>
          </div>
          <Badge tone={p.status === 'active' ? 'brand' : 'neutral'}>{p.status}</Badge>
        </div>
        {p.description && <div className="mt-4 text-[13px] text-text-soft">{p.description}</div>}
      </Card>

      {/* DISCOVERY: shown automatically when there are no tasks yet,
          or on demand via the "Iniciar otra conversación" button. */}
      {(tasks.length === 0 || showDiscovery) && !allTasks.loading && (
        <DiscoveryChat
          client={client}
          projectCode={projectCode}
          onApproved={(result) => {
            setShowDiscovery(false)
            onChanged?.()
            allTasks.refetch()
            stories.refetch()
            // Auto-navigate into the first task that was just materialized
            // (typically the T0 arch task) so the user lands directly on
            // its wizard instead of an empty-looking task list.
            const firstTaskId = result.taskIds[0]
            if (firstTaskId) onSelectTask?.(firstTaskId)
          }}
        />
      )}

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Tareas</h3>
          <div className="flex gap-2">
            {tasks.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setShowDiscovery((v) => !v)}>
                {showDiscovery ? 'Ocultar discovery' : '💬 Nueva conversación'}
              </Button>
            )}
            <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Cancelar' : '+ Tarea rápida'}
            </Button>
          </div>
        </div>

        {showCreate && (
          <div className="mt-4 border-t border-border pt-4">
            <CreateTaskInline
              client={client}
              projectCode={projectCode}
              existingStories={stories.data ?? []}
              onCreated={(taskId) => {
                setShowCreate(false)
                onChanged?.()
                onSelectTask?.(taskId)
              }}
            />
          </div>
        )}

        <div className="mt-4 space-y-2">
          {allTasks.loading && !allTasks.data && (
            <div className="text-[12px] text-text-muted">Cargando tareas…</div>
          )}
          {tasks.length === 0 && !allTasks.loading && (
            <div className="text-[12px] text-text-muted">
              Aún no hay tareas. Usa el chat de descubrimiento arriba (recomendado) o crea una tarea
              rápida sin pasar por discovery.
            </div>
          )}
          {tasks.length > 0 && <StoriesProgress stories={stories.data ?? []} tasks={tasks} />}
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onClick={() => onSelectTask?.(t.id)} />
          ))}
        </div>
      </Card>

      <ApprovedStoriesCard
        client={client}
        stories={stories.data ?? []}
        onCreatedBugfix={(taskId) => {
          onChanged?.()
          allTasks.refetch()
          stories.refetch()
          onSelectTask?.(taskId)
        }}
      />

      <Card>
        <button
          type="button"
          onClick={() => setShowCost((v) => !v)}
          className="w-full flex items-center gap-2 text-left text-[13px] font-medium text-text"
        >
          <span className="text-text-muted">{showCost ? '▾' : '▸'}</span>
          <span>Reporte de costo</span>
        </button>
        {showCost && (
          <div className="mt-4">
            <CostReport client={client} projectCode={projectCode} refreshKey={refreshKey} />
          </div>
        )}
      </Card>

      <CollapsibleSection title="Diseño (Figma)">
        <DesignPanel client={client} projectCode={projectCode} stories={stories.data ?? []} />
      </CollapsibleSection>

      <CollapsibleSection title="Gastos del proyecto">
        <ExpensesPanel client={client} projectCode={projectCode} />
      </CollapsibleSection>

      <CollapsibleSection title="Credenciales (secrets)">
        <SecretsPanel client={client} projectCode={projectCode} />
      </CollapsibleSection>

      <CollapsibleSection title="Conexiones MCP">
        <ProjectMcpsPanel client={client} projectCode={projectCode} />
      </CollapsibleSection>

      <CollapsibleSection title="Variables de entorno">
        <ProjectEnvsPanel client={client} projectCode={projectCode} />
      </CollapsibleSection>

      <CollapsibleSection title="Skills del agente">
        <ProjectSkillsPanel client={client} projectCode={projectCode} />
      </CollapsibleSection>

      <DangerZone client={client} project={p} onArchived={() => onChanged?.()} />
    </Stack>
  )
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-left text-[13px] font-medium text-text"
      >
        <span className="text-text-muted">{open ? '▾' : '▸'}</span>
        <span>{title}</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  )
}

function DangerZone({
  client,
  project,
  onArchived,
}: {
  client: ApiClient
  project: { id: string; code: string; status: string }
  onArchived: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function archive() {
    if (
      !confirm(
        `Archivar proyecto "${project.code}"? El soft-delete oculta el proyecto de la lista. Esto es recuperable manualmente desde la DB.`,
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await client.projects.delete(project.id)
      onArchived()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 text-left text-[13px] font-medium text-danger"
      >
        <span className="text-danger/60">{expanded ? '▾' : '▸'}</span>
        <span>Zona de peligro</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="text-[12px] text-text-soft">
            Acciones destructivas (soft-delete). Recuperables a mano desde la base de datos pero NO
            desde la UI todavía.
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-text">Archivar proyecto</div>
              <div className="text-[11px] text-text-muted">
                Marca el proyecto como soft-deleted. Desaparece de la lista del sidebar y de los
                reportes.
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={archive} disabled={busy}>
              {busy ? '…' : 'Archivar'}
            </Button>
          </div>
          {error && <div className="text-[12px] text-danger">{error}</div>}
        </div>
      )}
    </Card>
  )
}

function TaskRow({
  task,
  onClick,
}: {
  task: TaskWithStory
  onClick: () => void
}) {
  const statusLabel = humanizeTaskStatus(task.status)
  const statusTone = statusToTone(task.status)
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-border bg-bg hover:bg-bg-alt px-3 py-3 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-text-muted">{task.code}</span>
            <span className="text-text-dim">·</span>
            <span className="text-[13px] text-text truncate">{task.story.title}</span>
          </div>
          {task.story.goal && (
            <div className="mt-0.5 text-[12px] text-text-muted truncate">{task.story.goal}</div>
          )}
        </div>
        <Badge tone={statusTone} outline>
          {statusLabel}
        </Badge>
      </div>
    </button>
  )
}

function CreateTaskInline({
  client,
  projectCode,
  existingStories,
  onCreated,
}: {
  client: ApiClient
  projectCode: string
  existingStories: StoryDTO[]
  onCreated: (taskId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!title.trim()) {
      setError('Pon un título')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // 1) get or create the project's current quote
      const quote = await client.quotes.getCurrent(projectCode)
      // 2) generate next story code
      const storyCode = nextCode(
        projectCode,
        existingStories.map((s) => s.code),
      )
      const story = await client.stories.create({
        quoteId: quote.id,
        code: storyCode,
        title: title.trim(),
        goal: goal.trim() || title.trim(),
        priority: 1,
        ownerRole: 'dev',
        estimatedHoursMin: 60,
        acceptanceCriteriaJson: '[]',
        inputsJson: '{}',
        outputsJson: '{}',
        verificationJson: '{}',
        outOfScopeJson: '[]',
      })
      // 3) create the implementation task on that story
      const task = await client.tasks.create({
        storyId: story.id,
        code: `${storyCode}-T1`,
        type: 'impl',
        ownerRole: 'dev',
        estimatedHoursMin: 60,
      })
      setTitle('')
      setGoal('')
      onCreated(task.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <TextField
        label="¿Qué hay que hacer?"
        placeholder="Ej: Pantalla de login con email"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <TextField
        label="Detalle (opcional)"
        placeholder="Ej: El usuario entra con email y password, hay validación básica"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      {error && <div className="text-[12px] text-danger">{error}</div>}
      <div className="flex justify-end">
        <Button variant="turtle" onClick={submit} disabled={busy}>
          {busy ? 'Creando…' : '▶ Crear tarea'}
        </Button>
      </div>
    </div>
  )
}

function nextCode(projectCode: string, existing: string[]): string {
  const re = new RegExp(`^${projectCode}-(\\d+)$`, 'i')
  let max = 0
  for (const c of existing) {
    const m = c.match(re)
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10)
      if (!Number.isNaN(n) && n > max) max = n
    }
  }
  return `${projectCode}-${String(max + 1).padStart(3, '0')}`
}

function humanizeTaskStatus(status: string): string {
  const map: Record<string, string> = {
    pending: 'Por empezar',
    in_progress: 'En curso',
    qa: 'En revisión',
    approved: 'Lista',
    rejected: 'Rechazada',
    rework: 'Retrabajo',
  }
  return map[status] ?? status
}

function statusToTone(status: string): 'neutral' | 'brand' | 'turtle' | 'warning' | 'danger' {
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

/**
 * Top-of-the-task-list summary: how many stories closed across the
 * whole project, with a progress bar. In the current Tortuga model
 * each story has exactly one impl task, so "tasks approved" was
 * redundant with "stories approved" — only the story count is shown.
 * The bar updates live as the cascade in `approveTask` promotes
 * stories to `approved` whenever their last task is approved.
 */
function StoriesProgress({
  stories,
  tasks: _tasks,
}: {
  stories: StoryDTO[]
  tasks: TaskWithStory[]
}) {
  const totalStories = stories.length
  const approvedStories = stories.filter((s) => s.status === 'approved').length
  if (totalStories === 0) return null
  const pct = totalStories === 0 ? 0 : Math.round((approvedStories / totalStories) * 100)
  return (
    <div className="rounded-md border border-border bg-bg-alt px-3 py-2.5">
      <div className="flex items-center justify-between text-[12px] font-mono mb-1.5">
        <span className="text-text-muted">Progreso del proyecto</span>
        <span className="text-text">
          {approvedStories}
          <span className="text-text-dim">/</span>
          {totalStories}
          <span className="text-text-dim"> stories ({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-bg overflow-hidden">
        <div className="h-full bg-turtle transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ApprovedStoriesCard({
  client,
  stories,
  onCreatedBugfix,
}: {
  client: ApiClient
  stories: StoryDTO[]
  onCreatedBugfix: (taskId: string) => void
}) {
  const approved = stories.filter((s) => s.status === 'approved')
  const [reportingId, setReportingId] = useState<string | null>(null)
  if (approved.length === 0) return null
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
          Stories aprobadas
        </h3>
        <span className="text-[11px] text-text-muted font-mono">
          {approved.length} {approved.length === 1 ? 'aprobada' : 'aprobadas'}
        </span>
      </div>
      <div className="text-[12px] text-text-muted mt-1">
        Si al probar la app encontraste un error en una de estas, abre un bugfix.
      </div>
      <div className="mt-3 space-y-2">
        {approved.map((s) => (
          <div key={s.id} className="rounded-md border border-border bg-bg-alt">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2 truncate">
                  <span className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
                    {s.code}
                  </span>
                  <span className="text-[13px] text-text font-medium truncate">{s.title}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-text-muted truncate">{s.goal}</div>
              </div>
              <button
                type="button"
                onClick={() => setReportingId(reportingId === s.id ? null : s.id)}
                className="text-[11px] rounded-pill px-2.5 py-0.5 text-danger border border-danger/40 hover:bg-danger/10 transition-colors shrink-0"
              >
                {reportingId === s.id ? 'Cerrar' : 'Reportar problema'}
              </button>
            </div>
            {reportingId === s.id && (
              <div className="border-t border-border p-3">
                <ApprovedStoryBugfixForm
                  client={client}
                  storyId={s.id}
                  storyCode={s.code}
                  onClose={() => setReportingId(null)}
                  onCreated={(taskId) => {
                    setReportingId(null)
                    onCreatedBugfix(taskId)
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

function ApprovedStoryBugfixForm({
  client,
  storyId,
  storyCode,
  onClose,
  onCreated,
}: {
  client: ApiClient
  storyId: string
  storyCode: string
  onClose: () => void
  onCreated: (taskId: string) => void
}) {
  const [errorText, setErrorText] = useState('')
  const [contextNote, setContextNote] = useState('')
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setScreenshot(reader.result)
    }
    reader.readAsDataURL(file)
  }, [])

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') setScreenshot(reader.result)
        }
        reader.readAsDataURL(file)
        e.preventDefault()
        return
      }
    }
  }, [])

  const submit = async () => {
    if (!errorText.trim()) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await client.troubleshoot.createBugfix({
        storyId,
        errorText: errorText.trim(),
        ...(contextNote.trim() ? { contextNote: contextNote.trim() } : {}),
        ...(screenshot ? { beforeScreenshotPngBase64: screenshot } : {}),
      })
      onCreated(res.taskId)
    } catch (err) {
      setSubmitError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Stack gap="sm">
      <Eyebrow>Crear bugfix bajo {storyCode}</Eyebrow>
      <div>
        <label
          htmlFor="approved-story-bugfix-error"
          className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
        >
          Error (pega el texto exacto)
        </label>
        <textarea
          id="approved-story-bugfix-error"
          ref={taRef}
          value={errorText}
          onChange={(e) => setErrorText(e.target.value)}
          onPaste={onPaste}
          rows={5}
          placeholder="PostgrestException(message: ..., code: 42501, ...)"
          className="w-full rounded-md bg-bg border border-border focus:border-brand/60 px-3 py-2 text-[12.5px] font-mono outline-none"
        />
      </div>
      <div>
        <label
          htmlFor="approved-story-bugfix-context"
          className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
        >
          ¿Qué estabas haciendo? (opcional)
        </label>
        <input
          id="approved-story-bugfix-context"
          type="text"
          value={contextNote}
          onChange={(e) => setContextNote(e.target.value)}
          placeholder="Llené el form 'Crear hogar' y di Crear"
          className="w-full rounded-md bg-bg border border-border focus:border-brand/60 px-3 py-2 text-[13px] outline-none"
        />
      </div>
      <div>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: heading-style label for an image preview + file input group below */}
        <label className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5">
          Screenshot (opcional)
        </label>
        {screenshot ? (
          <div className="relative inline-block">
            <img
              src={screenshot}
              alt="screenshot"
              className="max-h-32 rounded-md border border-border"
            />
            <button
              type="button"
              onClick={() => setScreenshot(null)}
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-danger text-white text-[11px] leading-none"
              aria-label="Quitar"
            >
              ×
            </button>
          </div>
        ) : (
          <label className="block rounded-md border border-dashed border-border hover:border-border-strong px-3 py-3 text-center text-[12px] text-text-muted cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => handleFiles(e.target.files)}
            />
            Suelta una imagen, click para elegir, o Ctrl+V en el campo de error
          </label>
        )}
      </div>
      {submitError && <div className="text-[12px] text-danger">{submitError}</div>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={submit}
          disabled={submitting || !errorText.trim()}
        >
          {submitting ? 'Creando…' : 'Crear bugfix y diagnosticar'}
        </Button>
      </div>
    </Stack>
  )
}
