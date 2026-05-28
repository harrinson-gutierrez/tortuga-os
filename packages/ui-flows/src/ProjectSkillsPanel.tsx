import type { ApiClient, SkillPackInfo } from '@tortuga-os/api-client'
import { Card, Dot, Eyebrow } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface ProjectSkillsPanelProps {
  client: ApiClient
  projectCode: string
}

/**
 * Skill packs catalog scoped to a project. Activation is automatic
 * (driven by the project's stack + the agent role of each run); this
 * panel lets the operator manually OPT OUT of a pack that would
 * normally auto-activate. Disabling a pack persists into
 * `projects.disabled_skills_json` and takes effect on the next run.
 */
export function ProjectSkillsPanel({ client, projectCode }: ProjectSkillsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const { data, error } = useAsyncData(
    () => client.skills.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )

  async function toggle(skill: SkillPackInfo) {
    setBusy(skill.name)
    try {
      const nextDisabled = !(skill.enabled === false)
      await client.skills.toggle(projectCode, skill.name, nextDisabled)
      setRefreshKey((k) => k + 1)
    } finally {
      setBusy(null)
    }
  }

  if (error) {
    return (
      <Card>
        <div className="text-[12px] text-danger">
          No se pudo cargar la lista de skills: {String(error)}
        </div>
      </Card>
    )
  }
  if (!data) {
    return (
      <Card>
        <div className="text-[12px] text-text-muted">Cargando skills…</div>
      </Card>
    )
  }

  const auto = data.skills.filter((s) => s.autoActive)
  const inactive = data.skills.filter((s) => !s.autoActive)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Eyebrow className="mb-1">Skills activos</Eyebrow>
        <p className="text-[11px] text-text-muted mb-2">
          Cada agent run hereda estos packs según el stack del proyecto y el rol del agente.
          Desactiva uno si su guía no aplica a este proyecto en particular.
        </p>
        {auto.length === 0 ? (
          <Card>
            <div className="text-[12px] text-text-muted">
              Ningún skill auto-activa para este proyecto. Define el stack para activar guías
              específicas.
            </div>
          </Card>
        ) : (
          <Card>
            <ul className="flex flex-col gap-0.5">
              {auto.map((s) => (
                <li
                  key={s.name}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Dot tone={s.enabled ? 'turtle' : 'amber'} size="xs" />
                    <span className="font-mono text-[12px]">{s.name}</span>
                    <span className="text-[10px] text-text-dim truncate">
                      {s.autoActivatedReason}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    disabled={busy === s.name}
                    className={[
                      'text-[11px] px-2 h-6 rounded border transition-colors',
                      s.enabled
                        ? 'border-border text-text-muted hover:text-text hover:border-border-strong'
                        : 'border-amber/40 text-amber hover:border-amber',
                    ].join(' ')}
                  >
                    {busy === s.name ? '…' : s.enabled ? 'Desactivar' : 'Reactivar'}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <div>
        <Eyebrow className="mb-1">Disponibles, no activos</Eyebrow>
        <p className="text-[11px] text-text-muted mb-2">
          Estos packs existen en el bundle pero no auto-activan para esta combinación de stack/rol.
          No se pueden forzar manualmente desde aquí (activarlos requiere cambiar el stack del
          proyecto).
        </p>
        {inactive.length === 0 ? (
          <Card>
            <div className="text-[12px] text-text-muted">
              Todos los packs disponibles ya están activos.
            </div>
          </Card>
        ) : (
          <Card>
            <ul className="flex flex-wrap gap-1">
              {inactive.map((s) => (
                <li
                  key={s.name}
                  className="font-mono text-[11px] px-2 py-0.5 rounded bg-surface-2 text-text-dim border border-border"
                >
                  {s.name}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  )
}
