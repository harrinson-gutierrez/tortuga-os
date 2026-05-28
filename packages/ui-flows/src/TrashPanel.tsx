import type { ApiClient } from '@tortuga-os/api-client'
import { Button, Card } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface TrashPanelProps {
  client: ApiClient
  onClose?: () => void
}

type Tab = 'clients' | 'people' | 'projects'

/**
 * Soft-delete recovery view. Rows live in DB with deletedAt set; this
 * panel surfaces them and exposes a one-click restore.
 *
 * The three tabs (clients / people / projects) map 1:1 to the entities
 * Tortuga supports soft-deleting today. Stories/tasks/quotes cascade
 * with their project so they don't need their own tab — restoring the
 * project brings the subtree back.
 */
export function TrashPanel({ client, onClose }: TrashPanelProps) {
  const [tab, setTab] = useState<Tab>('clients')
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const bump = () => setRefreshKey((k) => k + 1)

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">Papelera</h3>
          <div className="text-[12px] text-text-muted mt-1">
            Filas con soft-delete. Restaurar trae la fila a la lista activa (los hijos cascadeados
            vuelven con su padre).
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>

      <div className="mt-4 flex gap-1 border-b border-border">
        <TabButton current={tab} value="clients" onClick={() => setTab('clients')}>
          Clientes
        </TabButton>
        <TabButton current={tab} value="people" onClick={() => setTab('people')}>
          Personas
        </TabButton>
        <TabButton current={tab} value="projects" onClick={() => setTab('projects')}>
          Proyectos
        </TabButton>
      </div>

      {error && <div className="text-[12px] text-danger mt-2">{error}</div>}

      <div className="mt-3">
        {tab === 'clients' && (
          <ClientsTrash
            client={client}
            refreshKey={refreshKey}
            onChanged={bump}
            onError={setError}
          />
        )}
        {tab === 'people' && (
          <PeopleTrash
            client={client}
            refreshKey={refreshKey}
            onChanged={bump}
            onError={setError}
          />
        )}
        {tab === 'projects' && (
          <ProjectsTrash
            client={client}
            refreshKey={refreshKey}
            onChanged={bump}
            onError={setError}
          />
        )}
      </div>
    </Card>
  )
}

function TabButton({
  current,
  value,
  children,
  onClick,
}: {
  current: Tab
  value: Tab
  children: React.ReactNode
  onClick: () => void
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] border-b-2 -mb-px transition-colors ${
        active
          ? 'border-brand text-text font-medium'
          : 'border-transparent text-text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function ClientsTrash({
  client,
  refreshKey,
  onChanged,
  onError,
}: {
  client: ApiClient
  refreshKey: number
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const { data, loading } = useAsyncData(() => client.trash.listClients(), [client, refreshKey])
  if (loading && !data) return <Empty label="Cargando…" />
  if (!data || data.length === 0) return <Empty label="No hay clientes archivados." />
  return (
    <div className="space-y-1.5">
      {data.map((c) => (
        <Row
          key={c.id}
          title={c.name}
          subtitle={[c.taxId, c.contactEmail].filter(Boolean).join(' · ')}
          onRestore={async () => {
            try {
              await client.trash.restoreClient(c.id)
              onChanged()
            } catch (err) {
              onError((err as Error).message)
            }
          }}
        />
      ))}
    </div>
  )
}

function PeopleTrash({
  client,
  refreshKey,
  onChanged,
  onError,
}: {
  client: ApiClient
  refreshKey: number
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const { data, loading } = useAsyncData(() => client.trash.listPeople(), [client, refreshKey])
  if (loading && !data) return <Empty label="Cargando…" />
  if (!data || data.length === 0) return <Empty label="No hay personas archivadas." />
  return (
    <div className="space-y-1.5">
      {data.map((p) => (
        <Row
          key={p.id}
          title={p.name}
          subtitle={p.email ?? ''}
          onRestore={async () => {
            try {
              await client.trash.restorePerson(p.id)
              onChanged()
            } catch (err) {
              onError((err as Error).message)
            }
          }}
        />
      ))}
    </div>
  )
}

function ProjectsTrash({
  client,
  refreshKey,
  onChanged,
  onError,
}: {
  client: ApiClient
  refreshKey: number
  onChanged: () => void
  onError: (msg: string) => void
}) {
  const { data, loading } = useAsyncData(() => client.trash.listProjects(), [client, refreshKey])
  if (loading && !data) return <Empty label="Cargando…" />
  if (!data || data.length === 0) return <Empty label="No hay proyectos archivados." />
  return (
    <div className="space-y-1.5">
      {data.map((p) => (
        <Row
          key={p.id}
          title={`${p.code} — ${p.name}`}
          subtitle={`Cliente: ${p.client.name}`}
          onRestore={async () => {
            try {
              await client.trash.restoreProject(p.id)
              onChanged()
            } catch (err) {
              onError((err as Error).message)
            }
          }}
        />
      ))}
    </div>
  )
}

function Row({
  title,
  subtitle,
  onRestore,
}: {
  title: string
  subtitle: string
  onRestore: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-bg/30 px-3 py-2 gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-text truncate">{title}</div>
        {subtitle && <div className="text-[11px] text-text-muted truncate">{subtitle}</div>}
      </div>
      <Button
        size="sm"
        variant="turtle"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onRestore()
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? '…' : '↺ Restaurar'}
      </Button>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="text-[12px] text-text-muted py-3">{label}</div>
}
