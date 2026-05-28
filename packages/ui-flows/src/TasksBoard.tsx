import type { ApiClient } from '@tortuga-os/api-client'
import type { TaskDTO } from '@tortuga-os/contracts'
import { ROLES, TASK_TYPES } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select, Stack, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface TasksBoardProps {
  client: ApiClient
  storyId: string
  storyCode: string
  refreshKey?: number
  onChanged?: () => void
  onSelectTask?: (taskId: string | null) => void
  selectedTaskId?: string | null
}

const STATUS_TONE: Record<
  TaskDTO['status'],
  'neutral' | 'brand' | 'warning' | 'turtle' | 'danger'
> = {
  pending: 'neutral',
  in_progress: 'brand',
  qa: 'warning',
  approved: 'turtle',
  rejected: 'danger',
  rework: 'danger',
}

export function TasksBoard({
  client,
  storyId,
  storyCode,
  refreshKey = 0,
  onChanged,
  onSelectTask,
  selectedTaskId,
}: TasksBoardProps) {
  const [creating, setCreating] = useState(false)
  const tasks = useAsyncData(
    () => client.tasks.listForStory(storyId),
    [client, storyId, refreshKey],
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(taskId: string, fn: () => Promise<unknown>) {
    setBusyId(taskId)
    setActionError(null)
    try {
      await fn()
      await tasks.refetch()
      onChanged?.()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Tasks</h3>
          <div className="text-[12px] text-text-muted mt-1 font-mono">{storyCode}</div>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancelar' : '+ Nueva task'}
        </Button>
      </div>

      {creating && (
        <div className="mt-4 border-t border-border pt-4">
          <CreateTaskForm
            client={client}
            storyId={storyId}
            storyCode={storyCode}
            existingCount={tasks.data?.length ?? 0}
            onCancel={() => setCreating(false)}
            onCreated={() => {
              setCreating(false)
              tasks.refetch()
              onChanged?.()
            }}
          />
        </div>
      )}

      {actionError && <div className="mt-3 text-[12px] text-danger">{actionError}</div>}

      <div className="mt-5 border-t border-border">
        {tasks.error && <div className="text-[12px] text-danger py-3">{tasks.error}</div>}
        {tasks.loading && !tasks.data && (
          <div className="text-[12px] text-text-muted py-3">Cargando tasks…</div>
        )}
        {tasks.data && tasks.data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">La story no tiene tasks aún.</div>
        )}
        {tasks.data?.map((t) => {
          const isSel = t.id === selectedTaskId
          const canStart = t.status === 'pending'
          const canSubmit = t.status === 'in_progress' || t.status === 'rework'
          const canApprove = t.status === 'qa'
          const canReject = t.status === 'qa'
          const isBusy = busyId === t.id
          return (
            <div
              key={t.id}
              className={`border-b border-border py-3 px-1 transition-colors ${isSel ? 'bg-surface-2' : ''}`}
            >
              <button
                type="button"
                onClick={() => onSelectTask?.(isSel ? null : t.id)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 truncate">
                      <span className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
                        {t.code}
                      </span>
                      <Badge tone="neutral" outline>
                        {t.type}
                      </Badge>
                      <span className="text-[11px] text-text-dim font-mono">
                        iter n={t.currentIteration}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-text-muted">
                      owner: <span className="text-text">{t.ownerRole}</span>
                      {t.assignee && <span className="ml-2 text-text-dim">· {t.assignee}</span>}
                      <span className="ml-3 text-text-dim font-mono">
                        {(t.actualHoursMin / 60).toFixed(1)}h /{' '}
                        {(t.estimatedHoursMin / 60).toFixed(1)}h
                      </span>
                    </div>
                  </div>
                  <Badge tone={STATUS_TONE[t.status]} outline={t.status !== 'in_progress'}>
                    {t.status}
                  </Badge>
                </div>
              </button>

              <div className="mt-2 flex gap-2 flex-wrap">
                {canStart && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => run(t.id, () => client.tasks.start(t.id))}
                    disabled={isBusy}
                  >
                    Start
                  </Button>
                )}
                {canSubmit && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => run(t.id, () => client.tasks.submitQa(t.id))}
                    disabled={isBusy}
                  >
                    Submit QA →
                  </Button>
                )}
                {canApprove && (
                  <Button
                    size="sm"
                    variant="turtle"
                    onClick={() =>
                      run(t.id, () =>
                        client.tasks.approve(t.id, { closedByRole: 'qa', notes: 'approved' }),
                      )
                    }
                    disabled={isBusy}
                  >
                    ✓ Approve
                  </Button>
                )}
                {canReject && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      const reason = window.prompt('Motivo del reject (rework):')
                      if (!reason || !reason.trim()) return
                      run(t.id, () =>
                        client.tasks.reject(t.id, {
                          closedByRole: 'qa',
                          notes: reason.trim(),
                        }),
                      )
                    }}
                    disabled={isBusy}
                  >
                    ✗ Reject (rework)
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function CreateTaskForm({
  client,
  storyId,
  storyCode,
  existingCount,
  onCreated,
  onCancel,
}: {
  client: ApiClient
  storyId: string
  storyCode: string
  existingCount: number
  onCreated: () => void
  onCancel: () => void
}) {
  const [code, setCode] = useState(`${storyCode}-T${existingCount + 1}`)
  const [type, setType] = useState<TaskDTO['type']>('impl')
  const [ownerRole, setOwnerRole] = useState<TaskDTO['ownerRole']>('dev')
  const [assignee, setAssignee] = useState('')
  const [hours, setHours] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!code.trim()) {
      setError('code requerido')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await client.tasks.create({
        storyId,
        code: code.trim(),
        type,
        ownerRole,
        assignee: assignee.trim() || null,
        estimatedHoursMin: Math.round(Number.parseFloat(hours || '0') * 60),
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
      <Eyebrow>Nueva task</Eyebrow>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as TaskDTO['type'])}
          options={TASK_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select
          label="Owner role"
          value={ownerRole}
          onChange={(e) => setOwnerRole(e.target.value as TaskDTO['ownerRole'])}
          options={ROLES.filter((r) => r !== 'client').map((r) => ({ value: r, label: r }))}
        />
        <TextField
          label="Assignee (opcional)"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        />
        <TextField
          label="Estimado (h)"
          type="number"
          step="0.5"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>
      {error && <div className="text-[12px] text-danger">{error}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" onClick={submit} disabled={busy}>
          {busy ? 'Creando…' : 'Crear task'}
        </Button>
      </div>
    </Stack>
  )
}
