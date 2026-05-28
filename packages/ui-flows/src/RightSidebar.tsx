import type { ApiClient } from '@tortuga-os/api-client'
import { Badge, Eyebrow, Progress } from '@tortuga-os/ui'
import { useAsyncData } from './useAsyncData'

export interface RightSidebarProps {
  client: ApiClient
  projectCode?: string | null
  refreshKey?: number
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function RightSidebar({ client, projectCode, refreshKey = 0 }: RightSidebarProps) {
  const { data: cost } = useAsyncData(
    () => (projectCode ? client.reports.projectCost(projectCode) : Promise.resolve(null)),
    [client, projectCode, refreshKey],
  )

  const { data: projects } = useAsyncData(() => client.projects.list(), [client, refreshKey])

  return (
    <aside className="flex flex-col h-full w-[340px] shrink-0 border-l border-border bg-bg">
      <div className="px-5 py-5 space-y-6 overflow-y-auto">
        {/* MARGEN 30D */}
        <section>
          <Eyebrow className="mb-2">Margen 30D</Eyebrow>
          <div className="flex items-baseline gap-2">
            <div className="font-display font-medium text-[28px] tracking-tighter-2 text-text">
              {cost ? fmtMoney(cost.budgetCents - cost.spentCents) : '—'}
            </div>
            <Badge tone="turtle">↗ +12%</Badge>
          </div>
          <dl className="mt-3 space-y-1 text-[12px]">
            <Row label="Cobrado" value={cost ? fmtMoney(cost.budgetCents) : '—'} />
            <Row label="− Spent" value={cost ? fmtMoney(cost.spentCents) : '—'} />
            <Row
              label="− Rework"
              value={cost ? fmtMoney(cost.reworkCostCents) : '—'}
              tone="danger"
            />
          </dl>
        </section>

        {/* HORAS / TOPE */}
        <section>
          <Eyebrow className="mb-3">Horas / Tope</Eyebrow>
          <div className="space-y-3">
            {projects?.slice(0, 4).map((p, i) => (
              <div key={p.id}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-text">{p.code}</span>
                  <span className="text-text-muted font-mono">— / —</span>
                </div>
                <Progress
                  value={0.4 + (i % 3) * 0.15}
                  tone={(['brand', 'cyan', 'violet', 'amber'] as const)[i % 4]}
                />
              </div>
            ))}
            {(!projects || projects.length === 0) && (
              <div className="text-[12px] text-text-dim">Aún no hay proyectos.</div>
            )}
          </div>
        </section>

        {/* AGENT RUNS HOY (placeholder; no AI yet) */}
        <section>
          <Eyebrow className="mb-2">Operación hoy</Eyebrow>
          <div className="flex items-baseline gap-2">
            <div className="font-display font-medium text-[22px] tracking-tighter-2">
              {projects?.length ?? 0}
            </div>
            <span className="text-[12px] text-text-muted">proyectos activos</span>
          </div>
        </section>
      </div>
    </aside>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="flex justify-between">
      <dt className="text-text-muted">{label}</dt>
      <dd className={tone === 'danger' ? 'text-danger font-mono' : 'text-text font-mono'}>
        {value}
      </dd>
    </div>
  )
}
