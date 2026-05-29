import type { ApiClient } from '@tortuga-os/api-client'
import type { ProjectMcpDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow } from '@tortuga-os/ui'
import { useState } from 'react'
import { McpPresetWizard } from './McpPresetWizard'
import { MCP_PRESETS, type McpPreset } from './mcp-presets'
import { useAsyncData } from './useAsyncData'

export interface ProjectMcpsPanelProps {
  client: ApiClient
  projectCode: string
}

type InstallState = { mode: 'idle' } | { mode: 'grid' } | { mode: 'wizard'; preset: McpPreset }

export function ProjectMcpsPanel({ client, projectCode }: ProjectMcpsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const { data, error, loading } = useAsyncData(
    () => client.projectMcps.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )
  const [install, setInstall] = useState<InstallState>({ mode: 'idle' })
  const [actionError, setActionError] = useState<string | null>(null)

  const installedPresetIds = new Set(
    (data ?? []).map((m) => m.presetId).filter((p): p is string => !!p),
  )

  async function toggle(m: ProjectMcpDTO) {
    setActionError(null)
    try {
      await client.projectMcps.patch(m.id, { enabled: !m.enabled })
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  async function remove(m: ProjectMcpDTO) {
    if (!confirm(`Eliminar el MCP "${m.name}"? Los próximos agent runs no lo verán.`)) return
    setActionError(null)
    try {
      await client.projectMcps.remove(m.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setActionError((err as Error).message)
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
            Conexiones MCP
          </h3>
          <div className="text-[12px] text-text-muted mt-1">
            Servidores Model Context Protocol disponibles para los agent runs de este proyecto. Cada
            MCP corre en su propio proceso y recibe las credenciales del proyecto.
          </div>
        </div>
        {install.mode === 'idle' && (
          <Button size="sm" variant="turtle" onClick={() => setInstall({ mode: 'grid' })}>
            + Instalar MCP
          </Button>
        )}
      </div>

      {install.mode === 'grid' && (
        <div className="mt-4 rounded-md border border-border bg-bg/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>Escoge un preset</Eyebrow>
            <Button size="sm" variant="ghost" onClick={() => setInstall({ mode: 'idle' })}>
              ✗
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {MCP_PRESETS.map((p) => {
              const already = installedPresetIds.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setInstall({ mode: 'wizard', preset: p })}
                  disabled={already}
                  className="text-left rounded-md border border-border bg-surface px-3 py-3 hover:border-turtle/40 hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">{p.label}</span>
                    {already && (
                      <Badge tone="turtle" outline>
                        instalado
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-text-muted mt-1 line-clamp-2">
                    {p.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {install.mode === 'wizard' && (
        <div className="mt-4">
          <McpPresetWizard
            client={client}
            projectCode={projectCode}
            preset={install.preset}
            onCancel={() => setInstall({ mode: 'grid' })}
            onInstalled={() => {
              setInstall({ mode: 'idle' })
              setRefreshKey((k) => k + 1)
            }}
          />
        </div>
      )}

      <div className="mt-6 border-t border-border pt-3">
        <Eyebrow>Instalados ({data?.length ?? 0})</Eyebrow>
        {error && <div className="text-[12px] text-danger py-3">{error}</div>}
        {actionError && <div className="text-[12px] text-danger py-2">{actionError}</div>}
        {loading && !data && <div className="text-[12px] text-text-muted py-3">Cargando…</div>}
        {data && data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">
            Sin MCPs aún. Instala uno con el botón de arriba.
          </div>
        )}
        <div className="mt-2 space-y-1.5">
          {data?.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border border-border bg-bg/30 px-3 py-2 gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-mono font-medium">{m.name}</span>
                  <Badge tone={m.enabled ? 'turtle' : 'neutral'} outline>
                    {m.enabled ? 'activo' : 'pausado'}
                  </Badge>
                  <Badge tone="brand" outline>
                    {m.transport}
                  </Badge>
                  {m.presetId && (
                    <Badge tone="cyan" outline>
                      {m.presetId}
                    </Badge>
                  )}
                </div>
                {m.description && (
                  <div className="text-[11px] text-text-muted mt-1">{m.description}</div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggle(m)}
                title={m.enabled ? 'Pausar' : 'Activar'}
              >
                {m.enabled ? '⏸' : '▶'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(m)} title="Eliminar">
                ✗
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
