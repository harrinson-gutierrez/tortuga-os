import type { ApiClient } from '@tortuga-os/api-client'
import { Button, Card } from '@tortuga-os/ui'
import { TaskDetail } from './TaskDetail'
import { useAsyncData } from './useAsyncData'

export interface TaskDetailPageProps {
  client: ApiClient
  projectCode: string
  taskId: string
  refreshKey?: number
  onChanged?: () => void
  onBackToProject: () => void
}

/**
 * Full-width "page" view for a single task. Replaces the previous inline
 * task detail that lived under the task list — that layout made the
 * wizard and the emulator fight for the same horizontal space and the
 * page ended up looking cramped. Now each task gets all the room.
 */
export function TaskDetailPage({
  client,
  projectCode,
  taskId,
  refreshKey = 0,
  onChanged,
  onBackToProject,
}: TaskDetailPageProps) {
  // We need the project's DB stack (e.g. 'flutter-supabase') to pick the
  // right specialized dev agent and to know whether to render the
  // emulator panel. Fetched once per page open.
  const projectQuery = useAsyncData(
    () => client.projects.getByCode(projectCode),
    [client, projectCode, refreshKey],
  )

  // We also resolve the project's arch task so impl tasks can show the
  // "go to architecture first" CTA when needed.
  const stories = useAsyncData(
    () => client.stories.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )
  const archProbe = useAsyncData(async () => {
    const ss = stories.data ?? []
    for (const s of ss) {
      const ts = await client.tasks.listForStory(s.id)
      const arch = ts.find((t) => t.type === 'arch')
      if (arch) return arch
    }
    return null
  }, [client, stories.data, refreshKey])

  if (projectQuery.error)
    return (
      <Card>
        <div className="text-[13px] text-danger">{projectQuery.error}</div>
      </Card>
    )
  if (projectQuery.loading || !projectQuery.data)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando proyecto…</div>
      </Card>
    )

  const project = projectQuery.data
  const projectStack = project.stack && project.stack !== 'unknown' ? project.stack : null
  const gateStack: 'flutter' | 'node' = projectStack?.startsWith('flutter')
    ? 'flutter'
    : projectCode.toUpperCase().startsWith('FLUTTER')
      ? 'flutter'
      : 'node'

  const archTask = archProbe.data ?? null
  const archApproved = archTask?.status === 'approved'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={onBackToProject}>
          ← {project.code} · {project.name}
        </Button>
      </div>
      <TaskDetail
        client={client}
        taskId={taskId}
        projectCode={projectCode}
        stack={gateStack}
        projectStack={projectStack}
        archApproved={archApproved}
        archTaskId={archTask?.id ?? null}
        refreshKey={refreshKey}
        {...(onChanged ? { onChanged } : {})}
      />
    </div>
  )
}
