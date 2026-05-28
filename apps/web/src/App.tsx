import { type ApiClient, createApiClient } from '@tortuga-os/api-client'
import { Card, Dot, Eyebrow, ResizableRightbar } from '@tortuga-os/ui'
import {
  ClientsPanel,
  CreateProjectForm,
  EmulatorPanel,
  Footer,
  InboxPanel,
  KitTemplatesPanel,
  LeftSidebar,
  PeoplePanel,
  ProjectDetail,
  RightSidebar,
  TaskDetailPage,
  TrashPanel,
} from '@tortuga-os/ui-flows'
import { useEffect, useState } from 'react'

const BROWSER_FALLBACK_URL = 'http://127.0.0.1:31415'

type RightView =
  | { kind: 'empty' }
  | { kind: 'project'; code: string }
  | { kind: 'task'; projectCode: string; taskId: string }
  | { kind: 'new-project' }
  | { kind: 'people' }
  | { kind: 'clients' }
  | { kind: 'kits' }
  | { kind: 'inbox' }
  | { kind: 'trash' }

interface TauriInvokeShape {
  invoke(cmd: string): Promise<unknown>
}

function getTauriInvoke(): TauriInvokeShape['invoke'] | null {
  const w = globalThis as unknown as {
    __TAURI_INTERNALS__?: TauriInvokeShape
  }
  return w.__TAURI_INTERNALS__?.invoke?.bind(w.__TAURI_INTERNALS__) ?? null
}

async function bootstrapApiClient(): Promise<ApiClient> {
  const invoke = getTauriInvoke()
  if (!invoke) {
    return createApiClient({ baseUrl: BROWSER_FALLBACK_URL, secret: null })
  }
  const port = (await invoke('get_sidecar_port')) as number
  const token = (await invoke('get_sidecar_token')) as string
  if (!port) throw new Error('sidecar port not ready')
  return createApiClient({
    baseUrl: `http://127.0.0.1:${port}`,
    secret: token,
  })
}

export function App() {
  const [apiClient, setApiClient] = useState<ApiClient | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const tryBoot = async () => {
      try {
        const client = await bootstrapApiClient()
        if (!cancelled) setApiClient(client)
      } catch (e) {
        attempts++
        if (attempts < 30 && !cancelled) {
          setTimeout(tryBoot, 500)
        } else if (!cancelled) {
          setBootError((e as Error).message)
        }
      }
    }
    void tryBoot()
    return () => {
      cancelled = true
    }
  }, [])

  if (bootError)
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg text-danger font-mono text-[13px]">
        Sidecar no respondió: {bootError}
      </div>
    )
  if (!apiClient)
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-bg text-text-muted font-mono text-[13px]">
        Iniciando Tortuga OS…
      </div>
    )
  return <AppShell apiClient={apiClient} />
}

function AppShell({ apiClient }: { apiClient: ApiClient }) {
  const [view, setView] = useState<RightView>({ kind: 'empty' })
  const [refreshKey, setRefreshKey] = useState(0)
  const bumpRefresh = () => setRefreshKey((k) => k + 1)

  const selectedProject =
    view.kind === 'project' ? view.code : view.kind === 'task' ? view.projectCode : null

  // Focus mode: when the operator is inside a task, hide the marketing
  // header and the metrics sidebar so the wizard + emulator have all the
  // horizontal space. The left project sidebar stays — it's the only
  // navigation needed at that point.
  const focusMode = view.kind === 'task'

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <LeftSidebar
          client={apiClient}
          selectedCode={selectedProject}
          onSelectProject={(code) => setView({ kind: 'project', code })}
          onNewProject={() => setView({ kind: 'new-project' })}
          onPeople={() => setView({ kind: 'people' })}
          onClients={() => setView({ kind: 'clients' })}
          onKits={() => setView({ kind: 'kits' })}
          onInbox={() => setView({ kind: 'inbox' })}
          onTrash={() => setView({ kind: 'trash' })}
          refreshKey={refreshKey}
        />

        <main className="flex-1 min-w-0 overflow-y-auto">
          {!focusMode && (
            <div className="px-8 pt-8 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Dot tone="turtle" size="xs" />
                <span className="font-mono uppercase tracking-eyebrow text-[11px] text-text-muted">
                  Tortuga OS · Shell unificado · v0.1.2
                </span>
              </div>
              <h1 className="font-display font-medium text-[32px] tracking-tighter-2 mt-2 text-text">
                Una sola pantalla. Todo lo que importa, simultáneo.
              </h1>
              <p className="text-[13px] text-text-soft mt-2 max-w-3xl">
                Sin tabs, sin navegación, sin pérdida de contexto. Cabina permanente con kanban de 7
                fases, equipo en vivo, métricas a la derecha. Esta es la vista por defecto.
              </p>
            </div>
          )}

          <div className={focusMode ? 'px-6 py-4' : 'px-8 py-6'}>
            {!focusMode && <Eyebrow className="mb-3">{viewTitle(view)}</Eyebrow>}

            {view.kind === 'empty' && (
              <Card>
                <div className="text-[13px] text-text-muted">
                  Selecciona un proyecto a la izquierda, crea uno nuevo o abre el panel de personas.
                </div>
              </Card>
            )}

            {view.kind === 'new-project' && (
              <CreateProjectForm
                client={apiClient}
                onCreated={(code) => {
                  bumpRefresh()
                  setView({ kind: 'project', code })
                }}
                onCancel={() => setView({ kind: 'empty' })}
              />
            )}

            {view.kind === 'people' && (
              <PeoplePanel client={apiClient} onClose={() => setView({ kind: 'empty' })} />
            )}

            {view.kind === 'clients' && (
              <ClientsPanel client={apiClient} onClose={() => setView({ kind: 'empty' })} />
            )}

            {view.kind === 'kits' && (
              <KitTemplatesPanel client={apiClient} onClose={() => setView({ kind: 'empty' })} />
            )}

            {view.kind === 'inbox' && (
              <InboxPanel client={apiClient} onClose={() => setView({ kind: 'empty' })} />
            )}

            {view.kind === 'trash' && (
              <TrashPanel client={apiClient} onClose={() => setView({ kind: 'empty' })} />
            )}

            {view.kind === 'project' && (
              <ProjectDetail
                client={apiClient}
                projectCode={view.code}
                refreshKey={refreshKey}
                onChanged={bumpRefresh}
                onSelectTask={(taskId) => setView({ kind: 'task', projectCode: view.code, taskId })}
              />
            )}

            {view.kind === 'task' && (
              <TaskDetailPage
                client={apiClient}
                projectCode={view.projectCode}
                taskId={view.taskId}
                refreshKey={refreshKey}
                onChanged={bumpRefresh}
                onBackToProject={() => setView({ kind: 'project', code: view.projectCode })}
              />
            )}
          </div>
        </main>

        {!focusMode && (
          <RightSidebar client={apiClient} projectCode={selectedProject} refreshKey={refreshKey} />
        )}

        {focusMode && view.kind === 'task' && (
          <ResizableRightbar
            storageKey="tortuga.emulatorbar.width"
            defaultWidth={420}
            minWidth={320}
            maxWidth={720}
          >
            <div className="p-4">
              <EmulatorPanel client={apiClient} projectCode={view.projectCode} />
            </div>
          </ResizableRightbar>
        )}
      </div>

      <Footer client={apiClient} />
    </div>
  )
}

function viewTitle(view: RightView): string {
  switch (view.kind) {
    case 'empty':
      return 'Workspace'
    case 'new-project':
      return 'Nuevo proyecto'
    case 'people':
      return 'Personas'
    case 'clients':
      return 'Clientes'
    case 'kits':
      return 'Kits'
    case 'inbox':
      return 'Bandeja'
    case 'trash':
      return 'Papelera'
    case 'project':
      return `Proyecto · ${view.code}`
    case 'task':
      return `Proyecto · ${view.projectCode}`
  }
}
