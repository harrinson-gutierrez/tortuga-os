import type { ApiClient } from '@tortuga-os/api-client'
import { Card, Eyebrow } from '@tortuga-os/ui'
import { useAsyncData } from './useAsyncData'

export interface CostReportProps {
  client: ApiClient
  projectCode: string
  refreshKey?: number
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function CostReport({ client, projectCode, refreshKey = 0 }: CostReportProps) {
  const { data, error, loading } = useAsyncData(
    () => client.reports.projectCost(projectCode),
    [client, projectCode, refreshKey],
  )

  if (error)
    return (
      <Card>
        <div className="text-[13px] text-danger">Error: {error}</div>
      </Card>
    )
  if (loading || !data)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Calculando reporte…</div>
      </Card>
    )

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-display font-medium text-[17px] tracking-tighter-2 m-0">Cost report</h3>
        <span className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
          {data.projectCode}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-5">
        <Stat label="Budget" value={fmtMoney(data.budgetCents)} />
        <Stat label="Spent" value={fmtMoney(data.spentCents)} />
        <Stat label="Rework" value={fmtMoney(data.reworkCostCents)} tone="danger" />
        <Stat
          label="Client-initiated"
          value={fmtMoney(data.clientReworkCostCents)}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <Stat label="Gastos" value={fmtMoney(data.expensesCents)} />
        <Stat
          label="Consumo IA"
          value={fmtMoney(data.aiCostCents)}
          sub={`${data.aiRunCount} runs · ${fmtTokens(data.aiTokensIn + data.aiTokensOut)} tok`}
        />
        <Stat
          label="Margen"
          value={fmtMoney(data.marginCents)}
          tone={data.marginCents < 0 ? 'danger' : 'turtle'}
        />
      </div>

      <div className="mt-6 -mx-2">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-text-muted text-left">
              <th className="px-2 py-2 font-medium uppercase tracking-eyebrow text-[10px]">
                Phase
              </th>
              <th className="px-2 py-2 font-medium uppercase tracking-eyebrow text-[10px]">
                Clean h
              </th>
              <th className="px-2 py-2 font-medium uppercase tracking-eyebrow text-[10px]">
                Clean cost
              </th>
              <th className="px-2 py-2 font-medium uppercase tracking-eyebrow text-[10px]">
                Rework attr.
              </th>
              <th className="px-2 py-2 font-medium uppercase tracking-eyebrow text-[10px]">
                Rework cost
              </th>
            </tr>
          </thead>
          <tbody>
            {data.byPhase.map((row) => (
              <tr key={row.phase} className="border-t border-border">
                <td className="px-2 py-2 font-mono">{row.phase}</td>
                <td className="px-2 py-2 font-mono text-text-soft">
                  {fmtHours(row.cleanHoursMin)}
                </td>
                <td className="px-2 py-2 font-mono text-text-soft">
                  {fmtMoney(row.cleanCostCents)}
                </td>
                <td className="px-2 py-2 font-mono text-text-soft">
                  {fmtHours(row.reworkHoursAttributedMin)}
                </td>
                <td className="px-2 py-2 font-mono text-text-soft">
                  {fmtMoney(row.reworkCostAttributedCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  tone,
  sub,
}: {
  label: string
  value: string
  tone?: 'danger' | 'warning' | 'turtle'
  sub?: string
}) {
  const colorClass =
    tone === 'danger'
      ? 'text-danger'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'turtle'
          ? 'text-turtle'
          : 'text-text'
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div className={`font-display font-medium text-[20px] tracking-tighter-2 mt-1 ${colorClass}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] font-mono text-text-dim mt-0.5">{sub}</div>}
    </div>
  )
}
