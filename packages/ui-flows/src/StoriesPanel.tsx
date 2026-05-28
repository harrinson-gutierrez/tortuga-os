import type { ApiClient } from '@tortuga-os/api-client'
import type { StoryDTO } from '@tortuga-os/contracts'
import { ROLES } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select, Stack, TextField } from '@tortuga-os/ui'
import { useCallback, useRef, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface StoriesPanelProps {
  client: ApiClient
  projectCode: string
  refreshKey?: number
  selectedStoryId?: string | null
  onSelectStory?: (storyId: string | null) => void
  onSelectTask?: (taskId: string) => void
  onChanged?: () => void
}

const STATUS_TONE: Record<
  StoryDTO['status'],
  'neutral' | 'brand' | 'turtle' | 'warning' | 'danger'
> = {
  pending: 'neutral',
  in_progress: 'brand',
  qa: 'warning',
  approved: 'turtle',
  rejected: 'danger',
}

export function StoriesPanel({
  client,
  projectCode,
  refreshKey = 0,
  selectedStoryId,
  onSelectStory,
  onSelectTask,
  onChanged,
}: StoriesPanelProps) {
  const [creating, setCreating] = useState(false)
  const [bugfixingStoryId, setBugfixingStoryId] = useState<string | null>(null)

  // Need the current quote to attach the story.
  const quoteQuery = useAsyncData(
    () => client.quotes.getCurrent(projectCode),
    [client, projectCode, refreshKey],
  )
  const stories = useAsyncData(
    () => client.stories.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Stories</h3>
          <div className="text-[12px] text-text-muted mt-1">
            Unidad atómica de scope · pertenece al Quote actual
          </div>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancelar' : '+ Nueva story'}
        </Button>
      </div>

      {creating && quoteQuery.data && (
        <div className="mt-4 border-t border-border pt-4">
          <CreateStoryForm
            client={client}
            quoteId={quoteQuery.data.id}
            projectCode={projectCode}
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false)
              stories.refetch()
              onChanged?.()
            }}
          />
        </div>
      )}

      {creating && !quoteQuery.data && (
        <div className="mt-3 text-[12px] text-warning">
          Necesitas un Quote v1 antes de crear stories.
        </div>
      )}

      <div className="mt-5 border-t border-border">
        {stories.error && <div className="text-[12px] text-danger py-3">{stories.error}</div>}
        {stories.loading && !stories.data && (
          <div className="text-[12px] text-text-muted py-3">Cargando…</div>
        )}
        {stories.data && stories.data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">
            Aún no hay stories. Crea la primera arriba.
          </div>
        )}
        {stories.data?.map((s) => {
          const isSel = s.id === selectedStoryId
          const showBugfix = bugfixingStoryId === s.id
          return (
            <div key={s.id} className="border-b border-border">
              {/* biome-ignore lint/a11y/useSemanticElements: nested interactive elements prevent button conversion */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelectStory?.(isSel ? null : s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectStory?.(isSel ? null : s.id)
                  }
                }}
                className={`w-full text-left py-3 px-1 transition-colors cursor-pointer ${isSel ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 truncate">
                      <span className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
                        {s.code}
                      </span>
                      <span className="text-[14px] text-text font-medium truncate">{s.title}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted truncate">{s.goal}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-text-muted font-mono">
                      {(s.estimatedHoursMin / 60).toFixed(1)}h
                    </span>
                    <Badge tone={STATUS_TONE[s.status]} outline={s.status !== 'in_progress'}>
                      {s.status}
                    </Badge>
                    {s.status === 'approved' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setBugfixingStoryId(showBugfix ? null : s.id)
                        }}
                        className="text-[11px] rounded-pill px-2 py-0.5 text-danger border border-danger/40 hover:bg-danger/10 transition-colors"
                        title="Reportar un error encontrado al probar esta funcionalidad"
                      >
                        {showBugfix ? 'Cerrar' : 'Reportar problema'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {showBugfix && (
                <div className="border-t border-border bg-bg-alt p-3">
                  <BugfixComposer
                    client={client}
                    storyId={s.id}
                    storyCode={s.code}
                    onClose={() => setBugfixingStoryId(null)}
                    onCreated={(taskId) => {
                      setBugfixingStoryId(null)
                      onChanged?.()
                      onSelectTask?.(taskId)
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function CreateStoryForm({
  client,
  quoteId,
  projectCode,
  onCreated,
  onCancel,
}: {
  client: ApiClient
  quoteId: string
  projectCode: string
  onCreated: () => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [ownerRole, setOwnerRole] = useState<'dev' | 'designer' | 'qa' | 'sales' | 'pm'>('dev')
  const [hours, setHours] = useState('0')
  const [priority, setPriority] = useState('3')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!code.trim() || !title.trim() || !goal.trim()) {
      setError('code, title, goal son requeridos')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await client.stories.create({
        quoteId,
        code: code.trim(),
        title: title.trim(),
        goal: goal.trim(),
        ownerRole,
        estimatedHoursMin: Math.round(Number.parseFloat(hours || '0') * 60),
        priority: Number.parseInt(priority, 10),
        acceptanceCriteriaJson: '[]',
        inputsJson: '{}',
        outputsJson: '{}',
        verificationJson: '{}',
        outOfScopeJson: '[]',
      })
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack gap="md">
      <Eyebrow>Nueva story para {projectCode}</Eyebrow>
      <div className="grid grid-cols-[160px_1fr] gap-2">
        <TextField
          label="Code"
          placeholder={`${projectCode}-001`}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <TextField
          label="Title"
          placeholder="Implementar login con email/password"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <TextField
        label="Goal"
        placeholder="El usuario puede ingresar con email + clave"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-2">
        <Select
          label="Owner role"
          value={ownerRole}
          onChange={(e) => setOwnerRole(e.target.value as typeof ownerRole)}
          options={ROLES.filter((r) => r !== 'client').map((r) => ({ value: r, label: r }))}
        />
        <TextField
          label="Estimado (horas)"
          type="number"
          step="0.5"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
        <Select
          label="Prioridad"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={[
            { value: '1', label: '1 — máxima' },
            { value: '2', label: '2 — alta' },
            { value: '3', label: '3 — media' },
            { value: '4', label: '4 — baja' },
            { value: '5', label: '5 — backlog' },
          ]}
        />
      </div>
      {error && <div className="text-[12px] text-danger">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? 'Creando…' : 'Crear story'}
        </Button>
      </div>
    </Stack>
  )
}

function BugfixComposer({
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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

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
      <Eyebrow>Reportar problema en {storyCode}</Eyebrow>
      <div className="text-[12px] text-text-muted">
        Crea una subtarea de bugfix bajo esta story. El agente troubleshooter la diagnostica,
        propone fix y test de integración. La story queda intacta.
      </div>
      <div>
        <label
          htmlFor="bugfix-composer-error"
          className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
        >
          Error (pega el texto exacto)
        </label>
        <textarea
          id="bugfix-composer-error"
          ref={textareaRef}
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
          htmlFor="bugfix-composer-context"
          className="block text-[11px] font-mono uppercase tracking-eyebrow text-text-muted mb-1.5"
        >
          ¿Qué estabas haciendo? (opcional)
        </label>
        <input
          id="bugfix-composer-context"
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
          Screenshot (opcional · pega o suelta una imagen)
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
          {submitting ? 'Creando bugfix…' : 'Crear bugfix y diagnosticar'}
        </Button>
      </div>
    </Stack>
  )
}
