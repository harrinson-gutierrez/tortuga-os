import type { ApiClient } from '@tortuga-os/api-client'
import type { ProjectStatus } from '@tortuga-os/contracts'
import { Dot, Eyebrow, NavItem } from '@tortuga-os/ui'
import { useEffect, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface LeftSidebarProps {
  client: ApiClient
  selectedCode: string | null
  onSelectProject: (code: string) => void
  onNewProject: () => void
  onPeople: () => void
  onClients: () => void
  onKits: () => void
  onInbox: () => void
  onTrash: () => void
  refreshKey?: number
}

const INBOX_POLL_MS = 10_000

const PROJECT_DOT_TONES = ['brand', 'cyan', 'violet', 'amber', 'turtle'] as const

function projectDotTone(index: number) {
  return PROJECT_DOT_TONES[index % PROJECT_DOT_TONES.length] ?? 'brand'
}

const STATUS_HINT: Record<ProjectStatus, string> = {
  draft: '·',
  active: '●',
  paused: '◯',
  closed_won: '✓',
  closed_lost: '✗',
}

export function LeftSidebar({
  client,
  selectedCode,
  onSelectProject,
  onNewProject,
  onPeople,
  onClients,
  onKits,
  onInbox,
  onTrash,
  refreshKey = 0,
}: LeftSidebarProps) {
  const { data: projects } = useAsyncData(() => client.projects.list(), [client, refreshKey])
  const [inboxPollKey, setInboxPollKey] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setInboxPollKey((k) => k + 1), INBOX_POLL_MS)
    return () => clearInterval(interval)
  }, [])
  const { data: unread } = useAsyncData(
    () => client.inbox.unreadCount(),
    [client, refreshKey, inboxPollKey],
  )
  const unreadCount = unread?.count ?? 0

  return (
    <aside className="flex flex-col h-full w-[220px] shrink-0 border-r border-border bg-bg">
      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-2">
        <Dot tone="turtle" size="md" />
        <span className="font-display font-medium text-[15px] tracking-tighter-2">Tortuga OS</span>
      </div>

      <div className="px-3 pb-3">
        <input
          placeholder="Buscar…"
          className="w-full h-8 px-2.5 rounded-md bg-surface border border-border text-[12px] text-text placeholder:text-text-dim focus:border-border-strong outline-none"
        />
      </div>

      <div className="px-3 pt-1">
        <NavItem
          label="HOY"
          right="4h12"
          dot="turtle"
          active
          className="font-mono uppercase tracking-eyebrow text-[11px]"
        />
        <NavItem
          label="Inbox"
          right={unreadCount > 0 ? String(unreadCount) : undefined}
          dot={unreadCount > 0 ? 'brand' : undefined}
          onClick={onInbox}
        />
      </div>

      {/* PROYECTOS */}
      <div className="px-3 pt-5">
        <Eyebrow className="px-2.5 mb-1">Proyectos</Eyebrow>
        <div className="flex flex-col gap-0.5">
          {projects?.map((p, i) => (
            <NavItem
              key={p.id}
              label={p.code}
              right={STATUS_HINT[p.status]}
              dot={projectDotTone(i)}
              active={p.code === selectedCode}
              onClick={() => onSelectProject(p.code)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onNewProject}
          className="mt-1 w-full text-left px-2.5 h-8 text-[12px] text-text-muted hover:text-text transition-colors"
        >
          + nuevo proyecto
        </button>
      </div>

      {/* CLIENTES (placeholder; los listamos via people panel por ahora) */}
      <div className="px-3 pt-5">
        <Eyebrow className="px-2.5 mb-1">Equipo</Eyebrow>
        <NavItem label="Personas" onClick={onPeople} />
        <NavItem label="Clientes" onClick={onClients} />
      </div>

      <div className="px-3 pt-5">
        <Eyebrow className="px-2.5 mb-1">Integraciones</Eyebrow>
        <NavItem label="Kits" onClick={onKits} />
      </div>

      <div className="px-3 pt-5">
        <Eyebrow className="px-2.5 mb-1">Sistema</Eyebrow>
        <NavItem label="Papelera" onClick={onTrash} />
      </div>

      {/* Footer brand call-to-action */}
      <div className="mt-auto px-4 py-4 text-[10px] text-text-dim font-mono uppercase tracking-eyebrow">
        consulting workflow · v0.1.2
      </div>
    </aside>
  )
}
