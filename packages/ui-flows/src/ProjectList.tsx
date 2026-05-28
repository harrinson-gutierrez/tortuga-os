import type { ApiClient } from '@tortuga-os/api-client'
import type { ProjectStatus } from '@tortuga-os/contracts'
import { Badge, Card } from '@tortuga-os/ui'
import { useAsyncData } from './useAsyncData'

export interface ProjectListProps {
  client: ApiClient
  selectedCode?: string | null
  onSelectProject?: (code: string) => void
  refreshKey?: number
}

const STATUS_TONE: Record<ProjectStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  active: 'brand',
  paused: 'warning',
  closed_won: 'success',
  closed_lost: 'danger',
}

export function ProjectList({
  client,
  selectedCode,
  onSelectProject,
  refreshKey = 0,
}: ProjectListProps) {
  const { data, error, loading } = useAsyncData(() => client.projects.list(), [client, refreshKey])

  if (error)
    return (
      <Card>
        <div className="text-[13px] text-danger">Error: {error}</div>
      </Card>
    )
  if (loading || !data)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando proyectos…</div>
      </Card>
    )
  if (data.length === 0)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Aún no hay proyectos.</div>
      </Card>
    )

  return (
    <div className="grid gap-3">
      {data.map((p) => (
        <Card
          key={p.id}
          active={p.code === selectedCode}
          onClick={() => onSelectProject?.(p.code)}
          className={onSelectProject ? 'cursor-pointer hover:bg-surface-2 transition-colors' : ''}
        >
          <div className="flex justify-between items-center gap-3">
            <div className="min-w-0">
              <div className="font-display font-medium text-[17px] tracking-tighter-2 truncate">
                {p.code} <span className="text-text-muted font-sans font-normal">· {p.name}</span>
              </div>
              <div className="text-[12px] text-text-muted mt-0.5">{p.client.name}</div>
            </div>
            <Badge tone={STATUS_TONE[p.status]} outline={p.status !== 'active'}>
              {p.status}
            </Badge>
          </div>
          {p.description && <div className="text-[13px] text-text-soft mt-3">{p.description}</div>}
        </Card>
      ))}
    </div>
  )
}
