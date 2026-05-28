import type { ApiClient } from '@tortuga-os/api-client'
import type { ExpenseDTO, ProjectMarginDTO } from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Select, TextField } from '@tortuga-os/ui'
import { useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface ExpensesPanelProps {
  client: ApiClient
  projectCode: string
}

const CATEGORIES = [
  { value: 'contractor', label: 'Contratista' },
  { value: 'saas', label: 'SaaS' },
  { value: 'hosting', label: 'Hosting' },
  { value: 'license', label: 'Licencia' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'travel', label: 'Viajes' },
  { value: 'other', label: 'Otros' },
] as const

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtPct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

/**
 * Per-project expenses with a real-margin summary at the top.
 * Margin = approved-quote net total − Σ(non-deleted expenses).
 */
export function ExpensesPanel({ client, projectCode }: ExpensesPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)
  const expenses = useAsyncData(
    () => client.expenses.listForProject(projectCode),
    [client, projectCode, refreshKey],
  )
  const margin = useAsyncData(
    () => client.expenses.getMargin(projectCode),
    [client, projectCode, refreshKey],
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('contractor')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('0')
  const [incurredOn, setIncurredOn] = useState(today)

  async function add() {
    if (!description.trim()) {
      setError('Descripción requerida')
      return
    }
    const amountCents = Math.round(Number.parseFloat(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setError('Monto inválido')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await client.expenses.create({
        projectCode,
        category,
        vendor: vendor.trim() || undefined,
        description: description.trim(),
        amountCents,
        incurredOn,
      })
      setDescription('')
      setVendor('')
      setAmount('0')
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(e: ExpenseDTO) {
    if (!confirm(`Eliminar gasto "${e.description}"?`)) return
    try {
      await client.expenses.remove(e.id)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Card>
      <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
        Gastos del proyecto
      </h3>
      {margin.data && <MarginHeader m={margin.data} />}

      <div className="mt-5 border-t border-border pt-4">
        <Eyebrow>Registrar gasto</Eyebrow>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select
            label="Categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof category)}
            options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
          />
          <TextField
            label="Fecha"
            type="date"
            value={incurredOn}
            onChange={(e) => setIncurredOn(e.target.value)}
          />
        </div>
        <div className="mt-2">
          <TextField
            label="Descripción"
            placeholder="Ej. Suscripción Vercel mes 1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <TextField
            label="Proveedor (opcional)"
            placeholder="Vercel Inc."
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
          />
          <TextField
            label="Monto (COP)"
            type="number"
            step="1"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
        <div className="mt-3 flex justify-end">
          <Button onClick={add} disabled={busy}>
            {busy ? '…' : '+ Registrar'}
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-3">
        <Eyebrow>Historial ({expenses.data?.length ?? 0})</Eyebrow>
        {expenses.loading && !expenses.data && (
          <div className="text-[12px] text-text-muted py-3">Cargando…</div>
        )}
        {expenses.data && expenses.data.length === 0 && (
          <div className="text-[12px] text-text-muted py-3">Sin gastos registrados aún.</div>
        )}
        <div className="mt-2 space-y-1.5">
          {expenses.data?.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-md border border-border bg-bg/30 px-3 py-2 gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px] text-text truncate">
                  <Badge tone="neutral" outline>
                    {e.category}
                  </Badge>
                  <span>{e.description}</span>
                </div>
                <div className="text-[11px] text-text-muted">
                  {e.incurredOn}
                  {e.vendor && <span> · {e.vendor}</span>}
                </div>
              </div>
              <div className="text-[13px] font-mono text-text shrink-0">
                {fmtMoney(e.amountCents)}
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(e)}>
                ✗
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

function MarginHeader({ m }: { m: ProjectMarginDTO }) {
  const negative = m.marginCents < 0
  return (
    <div className="mt-4 grid grid-cols-4 gap-3">
      <Stat label="Cotizado neto" value={fmtMoney(m.quotedCents)} />
      <Stat label="Gastos" value={fmtMoney(m.expensesCents)} />
      <Stat label="Margen" value={fmtMoney(m.marginCents)} tone={negative ? 'danger' : 'turtle'} />
      <Stat label="Margen %" value={fmtPct(m.marginBps)} tone={negative ? 'danger' : 'turtle'} />
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'turtle' | 'danger'
}) {
  const valueClass =
    tone === 'danger' ? 'text-danger' : tone === 'turtle' ? 'text-turtle' : 'text-text'
  return (
    <div className="rounded-md border border-border bg-bg-alt px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-eyebrow text-text-muted">
        {label}
      </div>
      <div className={`mt-1 text-[16px] font-display font-medium tracking-tighter-2 ${valueClass}`}>
        {value}
      </div>
    </div>
  )
}
