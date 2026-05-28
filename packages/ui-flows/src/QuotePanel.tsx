import type { ApiClient } from '@tortuga-os/api-client'
import type {
  QuoteDTO,
  QuoteItemDTO,
  QuoteMilestoneDTO,
  QuoteModuleDTO,
} from '@tortuga-os/contracts'
import { Badge, Button, Card, Eyebrow, Stack, TextField } from '@tortuga-os/ui'
import { useMemo, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface QuotePanelProps {
  client: ApiClient
  projectCode: string
  refreshKey?: number
  onChanged?: () => void
}

const STATUS_TONE: Record<
  QuoteDTO['status'],
  'neutral' | 'brand' | 'turtle' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  sent: 'warning',
  changes_requested: 'warning',
  approved: 'turtle',
  rejected: 'danger',
}

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function fmtHours(min: number): string {
  return `${(min / 60).toFixed(1)} h`
}

function fmtPct(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`
}

/**
 * F3.2 proposal editor: header + status, draft-only item list with
 * inline editing, milestones, module palette to instance new items.
 * Totals come from the server (recomputed on every item mutation).
 */
export function QuotePanel({ client, projectCode, refreshKey = 0, onChanged }: QuotePanelProps) {
  const quote = useAsyncData(
    () => client.quotes.getCurrent(projectCode),
    [client, projectCode, refreshKey],
  )

  if (quote.error)
    return (
      <Card>
        <div className="text-[13px] text-danger">Error: {quote.error}</div>
      </Card>
    )
  if (quote.loading || !quote.data)
    return (
      <Card>
        <div className="text-[13px] text-text-muted">Cargando quote…</div>
      </Card>
    )

  return (
    <QuoteEditor
      client={client}
      projectCode={projectCode}
      quote={quote.data}
      onAnyChange={() => {
        quote.refetch()
        onChanged?.()
      }}
    />
  )
}

function QuoteEditor({
  client,
  projectCode,
  quote,
  onAnyChange,
}: {
  client: ApiClient
  projectCode: string
  quote: QuoteDTO
  onAnyChange: () => void
}) {
  const isDraft = quote.status === 'draft'
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [itemsKey, setItemsKey] = useState(0)
  const [modulesKey, setModulesKey] = useState(0)
  const [milestonesKey, setMilestonesKey] = useState(0)

  const items = useAsyncData(
    () => client.quoteItems.listForQuote(quote.id),
    [client, quote.id, itemsKey],
  )
  const milestones = useAsyncData(
    () => client.quoteMilestones.listForQuote(quote.id),
    [client, quote.id, milestonesKey],
  )
  const modules = useAsyncData(
    () => client.quoteModules.listForProject(projectCode),
    [client, projectCode, modulesKey],
  )

  function bumpAll() {
    setItemsKey((k) => k + 1)
    setMilestonesKey((k) => k + 1)
    onAnyChange()
  }

  async function send() {
    setBusy(true)
    setActionError(null)
    try {
      await client.quotes.send(quote.id)
      onAnyChange()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    setBusy(true)
    setActionError(null)
    try {
      await client.quotes.approve(quote.id)
      onAnyChange()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function requestChanges() {
    if (!feedback.trim()) {
      setActionError('Feedback es obligatorio para solicitar cambios')
      return
    }
    setBusy(true)
    setActionError(null)
    try {
      await client.quotes.requestChanges(quote.id, { feedback: feedback.trim() })
      setFeedback('')
      onAnyChange()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const milestoneTotalBps = useMemo(
    () => (milestones.data ?? []).reduce((acc, m) => acc + m.percentageBps, 0),
    [milestones.data],
  )

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
              Cotización
            </h3>
            <span className="font-mono text-[11px] text-text-muted uppercase tracking-eyebrow">
              v{quote.version} · {projectCode}
            </span>
          </div>
          <div className="text-[10px] font-mono text-text-dim mt-1 truncate max-w-[420px]">
            {quote.id}
          </div>
        </div>
        <Badge tone={STATUS_TONE[quote.status]}>{quote.status}</Badge>
      </div>

      <QuoteTotalsHeader
        client={client}
        quote={quote}
        isDraft={isDraft}
        onError={setActionError}
        onChange={() => onAnyChange()}
      />

      <Stack gap="md" className="mt-6">
        <ItemsSection
          client={client}
          quote={quote}
          items={items.data ?? []}
          loading={items.loading}
          isDraft={isDraft}
          onChange={bumpAll}
          onError={setActionError}
        />

        <ModulesPalette
          client={client}
          projectCode={projectCode}
          quote={quote}
          modules={modules.data ?? []}
          isDraft={isDraft}
          onItemCreated={bumpAll}
          onModulesChanged={() => setModulesKey((k) => k + 1)}
          onError={setActionError}
        />

        <MilestonesSection
          client={client}
          quote={quote}
          milestones={milestones.data ?? []}
          totalBps={milestoneTotalBps}
          isDraft={isDraft}
          onChange={() => setMilestonesKey((k) => k + 1)}
          onError={setActionError}
        />

        <div className="pt-4 border-t border-border flex flex-wrap gap-2 items-center">
          {quote.status === 'draft' && (
            <Button onClick={send} disabled={busy}>
              {busy ? '…' : 'Enviar al cliente →'}
            </Button>
          )}
          {quote.status === 'sent' && (
            <Button variant="turtle" onClick={approve} disabled={busy}>
              ✓ Aprobar (cierra F1 → abre F2)
            </Button>
          )}
          {quote.status === 'sent' && (
            <div className="flex-1 min-w-[260px]">
              <TextField
                label="Feedback del cliente"
                placeholder="¿Qué pide cambiar?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                disabled={busy}
              />
              <div className="mt-2">
                <Button size="sm" variant="ghost" onClick={requestChanges} disabled={busy}>
                  Solicitar cambios → v{quote.version + 1}
                </Button>
              </div>
            </div>
          )}
        </div>

        {actionError && <div className="text-[12px] text-danger">{actionError}</div>}

        {quote.approvedAt && (
          <div className="text-[11px] font-mono text-text-muted">
            Aprobada el {new Date(quote.approvedAt).toLocaleString()}
          </div>
        )}
      </Stack>
    </Card>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-alt px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-eyebrow text-text-muted">
        {label}
      </div>
      <div className="mt-1 text-[18px] font-display font-medium tracking-tighter-2">{value}</div>
    </div>
  )
}

function QuoteTotalsHeader({
  client,
  quote,
  isDraft,
  onError,
  onChange,
}: {
  client: ApiClient
  quote: QuoteDTO
  isDraft: boolean
  onError: (msg: string | null) => void
  onChange: () => void
}) {
  const [discountInput, setDiscountInput] = useState<string>((quote.discountBps / 100).toFixed(1))
  const [busy, setBusy] = useState(false)
  const netCents = Math.round(quote.totalCostCents * (1 - quote.discountBps / 10000))

  async function saveDiscount() {
    const pct = Number.parseFloat(discountInput)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      onError('Descuento debe ser un número entre 0 y 100')
      return
    }
    setBusy(true)
    onError(null)
    try {
      await client.quotes.patch(quote.id, { discountBps: Math.round(pct * 100) })
      onChange()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <SummaryStat label="Total horas" value={fmtHours(quote.totalHoursMin)} />
        <SummaryStat label="Subtotal" value={fmtMoney(quote.totalCostCents)} />
        <SummaryStat
          label={quote.discountBps > 0 ? `Total neto (−${fmtPct(quote.discountBps)})` : 'Total'}
          value={fmtMoney(netCents)}
        />
      </div>
      {isDraft && (
        <div className="flex items-end gap-2 rounded-md border border-border bg-bg-alt px-3 py-2">
          <div className="flex-1">
            <TextField
              label="Descuento global %"
              type="number"
              step="0.5"
              min="0"
              max="100"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              disabled={busy}
              hint="Se aplica sobre el subtotal. 0% = sin descuento."
            />
          </div>
          <Button size="sm" variant="ghost" onClick={saveDiscount} disabled={busy}>
            {busy ? '…' : 'Guardar'}
          </Button>
        </div>
      )}
    </div>
  )
}

function ItemsSection({
  client,
  quote,
  items,
  loading,
  isDraft,
  onChange,
  onError,
}: {
  client: ApiClient
  quote: QuoteDTO
  items: QuoteItemDTO[]
  loading: boolean
  isDraft: boolean
  onChange: () => void
  onError: (msg: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div>
      <div className="flex items-center justify-between">
        <Eyebrow>Items ({items.length})</Eyebrow>
        {isDraft && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            + Item custom
          </Button>
        )}
      </div>
      {loading && items.length === 0 && (
        <div className="text-[12px] text-text-muted py-2">Cargando…</div>
      )}
      {!loading && items.length === 0 && !adding && (
        <div className="text-[12px] text-text-muted py-2">
          Aún no hay items. Usa un módulo del palette abajo o agrega uno custom.
        </div>
      )}
      <div className="mt-2 space-y-1.5">
        {items.map((item, idx) => (
          <ItemRow
            key={item.id}
            client={client}
            item={item}
            isDraft={isDraft}
            canMoveUp={idx > 0}
            canMoveDown={idx < items.length - 1}
            onMoveUp={async () => {
              const prev = items[idx - 1]
              if (!prev) return
              try {
                await client.quoteItems.patch(item.id, { sortOrder: prev.sortOrder })
                await client.quoteItems.patch(prev.id, { sortOrder: item.sortOrder })
                onChange()
              } catch (e) {
                onError((e as Error).message)
              }
            }}
            onMoveDown={async () => {
              const next = items[idx + 1]
              if (!next) return
              try {
                await client.quoteItems.patch(item.id, { sortOrder: next.sortOrder })
                await client.quoteItems.patch(next.id, { sortOrder: item.sortOrder })
                onChange()
              } catch (e) {
                onError((e as Error).message)
              }
            }}
            onChange={onChange}
            onError={onError}
          />
        ))}
        {adding && (
          <NewItemInline
            client={client}
            quote={quote}
            onCreated={() => {
              setAdding(false)
              onChange()
            }}
            onCancel={() => setAdding(false)}
            onError={onError}
          />
        )}
      </div>
    </div>
  )
}

function ItemRow({
  client,
  item,
  isDraft,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onChange,
  onError,
}: {
  client: ApiClient
  item: QuoteItemDTO
  isDraft: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onChange: () => void
  onError: (msg: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [hours, setHours] = useState((item.hoursMin / 60).toFixed(1))
  const [rate, setRate] = useState(String(item.rateCents / 100))
  const [marginPct, setMarginPct] = useState((item.marginBps / 100).toFixed(1))
  const [busy, setBusy] = useState(false)

  async function save() {
    const hoursMin = Math.round(Number.parseFloat(hours) * 60)
    const rateCents = Math.round(Number.parseFloat(rate) * 100)
    const marginBps = Math.round(Number.parseFloat(marginPct) * 100)
    if (!Number.isFinite(hoursMin) || !Number.isFinite(rateCents) || !Number.isFinite(marginBps)) {
      onError('Valores numéricos inválidos')
      return
    }
    setBusy(true)
    onError(null)
    try {
      await client.quoteItems.patch(item.id, {
        label: label.trim() || item.label,
        hoursMin,
        rateCents,
        marginBps,
      })
      setEditing(false)
      onChange()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Eliminar item "${item.label}"?`)) return
    setBusy(true)
    onError(null)
    try {
      await client.quoteItems.remove(item.id)
      onChange()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border bg-bg/30 px-3 py-2">
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-text truncate">{item.label}</div>
          <div className="text-[11px] font-mono text-text-muted">
            {fmtHours(item.hoursMin)} · {fmtMoney(item.rateCents)}/h · margen{' '}
            {fmtPct(item.marginBps)}
          </div>
        </div>
        <div className="text-[13px] font-mono text-text">{fmtMoney(item.subtotalCents)}</div>
        {isDraft && (
          <div className="flex gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={onMoveUp}
              disabled={busy || !canMoveUp}
              title="Subir"
            >
              ▲
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onMoveDown}
              disabled={busy || !canMoveDown}
              title="Bajar"
            >
              ▼
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              ✎
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
              ✗
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-brand/40 bg-brand/5 px-3 py-2 space-y-2">
      <TextField
        label="Etiqueta"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="Horas"
          type="number"
          step="0.5"
          min="0"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Tarifa (COP/h)"
          type="number"
          step="1"
          min="0"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Margen %"
          type="number"
          step="0.1"
          min="0"
          value={marginPct}
          onChange={(e) => setMarginPct(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" variant="turtle" onClick={save} disabled={busy}>
          {busy ? '…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}

function NewItemInline({
  client,
  quote,
  onCreated,
  onCancel,
  onError,
}: {
  client: ApiClient
  quote: QuoteDTO
  onCreated: () => void
  onCancel: () => void
  onError: (msg: string | null) => void
}) {
  const [label, setLabel] = useState('')
  const [hours, setHours] = useState('0')
  const [rate, setRate] = useState('0')
  const [marginPct, setMarginPct] = useState('0')
  const [busy, setBusy] = useState(false)

  async function create() {
    if (!label.trim()) {
      onError('Etiqueta obligatoria')
      return
    }
    const hoursMin = Math.round(Number.parseFloat(hours) * 60)
    const rateCents = Math.round(Number.parseFloat(rate) * 100)
    const marginBps = Math.round(Number.parseFloat(marginPct) * 100)
    setBusy(true)
    onError(null)
    try {
      await client.quoteItems.create({
        quoteId: quote.id,
        label: label.trim(),
        hoursMin,
        rateCents,
        marginBps,
      })
      onCreated()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-brand/40 bg-brand/5 px-3 py-2 space-y-2">
      <TextField
        label="Etiqueta"
        placeholder="Ej. Auth básico con Supabase"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={busy}
      />
      <div className="grid grid-cols-3 gap-2">
        <TextField
          label="Horas"
          type="number"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Tarifa (COP/h)"
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Margen %"
          type="number"
          value={marginPct}
          onChange={(e) => setMarginPct(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" variant="turtle" onClick={create} disabled={busy}>
          {busy ? '…' : '+ Crear item'}
        </Button>
      </div>
    </div>
  )
}

function ModulesPalette({
  client,
  projectCode,
  quote,
  modules,
  isDraft,
  onItemCreated,
  onModulesChanged,
  onError,
}: {
  client: ApiClient
  projectCode: string
  quote: QuoteDTO
  modules: QuoteModuleDTO[]
  isDraft: boolean
  onItemCreated: () => void
  onModulesChanged: () => void
  onError: (msg: string | null) => void
}) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [marginPct, setMarginPct] = useState('25')
  const [busy, setBusy] = useState(false)

  async function instanceModule(m: QuoteModuleDTO) {
    const totalHours = Object.values(m.defaultHours).reduce((a, b) => a + b, 0)
    setBusy(true)
    onError(null)
    try {
      await client.quoteItems.create({
        quoteId: quote.id,
        moduleId: m.id,
        label: m.name,
        description: m.description ?? undefined,
        hoursMin: totalHours,
        rateCents: 0,
        marginBps: m.defaultMarginBps,
      })
      onItemCreated()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function createModule() {
    if (!name.trim()) {
      onError('Nombre del módulo requerido')
      return
    }
    const marginBps = Math.round(Number.parseFloat(marginPct) * 100)
    setBusy(true)
    onError(null)
    try {
      await client.quoteModules.create({
        projectCode,
        name: name.trim(),
        defaultMarginBps: marginBps,
      })
      setName('')
      setMarginPct('25')
      setCreating(false)
      onModulesChanged()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Eyebrow>Palette de módulos ({modules.length})</Eyebrow>
        {!creating && (
          <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
            + Nuevo módulo
          </Button>
        )}
      </div>
      {modules.length === 0 && !creating && (
        <div className="text-[12px] text-text-muted py-2">
          Aún no hay módulos guardados para este proyecto.
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {modules.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={!isDraft || busy}
            onClick={() => instanceModule(m)}
            className="rounded-md border border-border bg-bg/30 px-3 py-2 text-left hover:bg-bg-alt disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="text-[13px] text-text">{m.name}</div>
            <div className="text-[10px] font-mono text-text-muted mt-0.5">
              margen {fmtPct(m.defaultMarginBps)}
            </div>
          </button>
        ))}
      </div>
      {creating && (
        <div className="mt-2 rounded-md border border-brand/40 bg-brand/5 px-3 py-2 space-y-2">
          <TextField
            label="Nombre del módulo"
            placeholder="Ej. Auth básico"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
          <TextField
            label="Margen default %"
            type="number"
            value={marginPct}
            onChange={(e) => setMarginPct(e.target.value)}
            disabled={busy}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button size="sm" variant="turtle" onClick={createModule} disabled={busy}>
              {busy ? '…' : '+ Crear módulo'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MilestonesSection({
  client,
  quote,
  milestones,
  totalBps,
  isDraft,
  onChange,
  onError,
}: {
  client: ApiClient
  quote: QuoteDTO
  milestones: QuoteMilestoneDTO[]
  totalBps: number
  isDraft: boolean
  onChange: () => void
  onError: (msg: string | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [pct, setPct] = useState('50')
  const [busy, setBusy] = useState(false)

  async function add() {
    if (!label.trim()) {
      onError('Etiqueta requerida')
      return
    }
    const percentageBps = Math.round(Number.parseFloat(pct) * 100)
    setBusy(true)
    onError(null)
    try {
      await client.quoteMilestones.create({
        quoteId: quote.id,
        label: label.trim(),
        percentageBps,
      })
      setLabel('')
      setPct('50')
      setAdding(false)
      onChange()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(m: QuoteMilestoneDTO) {
    if (!confirm(`Eliminar milestone "${m.label}"?`)) return
    setBusy(true)
    onError(null)
    try {
      await client.quoteMilestones.remove(m.id)
      onChange()
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const isComplete = totalBps === 10000
  return (
    <div>
      <div className="flex items-center justify-between">
        <Eyebrow>
          Milestones de pago ({milestones.length}) · {fmtPct(totalBps)}
          {isComplete && <span className="text-turtle ml-1">✓</span>}
          {!isComplete && totalBps > 0 && (
            <span className="text-warning ml-1">(suma incompleta)</span>
          )}
        </Eyebrow>
        {isDraft && !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            + Milestone
          </Button>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {milestones.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-md border border-border bg-bg/30 px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-text truncate">{m.label}</div>
              {m.description && <div className="text-[11px] text-text-muted">{m.description}</div>}
            </div>
            <div className="text-[13px] font-mono text-text">{fmtPct(m.percentageBps)}</div>
            <div className="text-[12px] font-mono text-text-dim">
              ≈{' '}
              {fmtMoney(
                Math.round(
                  (quote.totalCostCents * (1 - quote.discountBps / 10000) * m.percentageBps) /
                    10000,
                ),
              )}
            </div>
            {isDraft && (
              <Button size="sm" variant="ghost" onClick={() => remove(m)} disabled={busy}>
                ✗
              </Button>
            )}
          </div>
        ))}
        {adding && (
          <div className="rounded-md border border-brand/40 bg-brand/5 px-3 py-2 space-y-2">
            <TextField
              label="Etiqueta"
              placeholder="Ej. Anticipo al firmar"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
            />
            <TextField
              label="% del total"
              type="number"
              step="1"
              min="0"
              max="100"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              disabled={busy}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button size="sm" variant="turtle" onClick={add} disabled={busy}>
                {busy ? '…' : '+ Agregar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
