import type { ApiClient } from '@tortuga-os/api-client'
import { Badge, Button, TextField } from '@tortuga-os/ui'
import { useMemo, useState } from 'react'
import { type McpPreset, buildCreateInputFromPreset } from './mcp-presets'

export interface McpPresetWizardProps {
  client: ApiClient
  projectCode: string
  preset: McpPreset
  onInstalled: () => void
  onCancel: () => void
}

export function McpPresetWizard({
  client,
  projectCode,
  preset,
  onInstalled,
  onCancel,
}: McpPresetWizardProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(
    () => preset.fields.every((f) => !f.required || (values[f.key] ?? '').trim().length > 0),
    [preset, values],
  )

  async function install() {
    if (!canSubmit) {
      setError('Faltan campos requeridos')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { createInput, secretsToCreate } = buildCreateInputFromPreset(preset, values)

      for (const s of secretsToCreate) {
        try {
          await client.secrets.create({
            projectCode,
            name: s.name,
            value: s.value,
            description: s.description,
          })
        } catch (err) {
          const msg = (err as Error).message
          if (!/already exists|duplicate|unique/i.test(msg)) throw err
        }
      }

      await client.projectMcps.create(projectCode, createInput)
      onInstalled()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-bg/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-display font-medium text-[16px] tracking-tighter-2 m-0">
              Instalar {preset.label}
            </h4>
            <Badge tone="brand" outline>
              {preset.transport}
            </Badge>
          </div>
          <div className="text-[12px] text-text-muted mt-1">{preset.description}</div>
          {preset.notes && (
            <div className="text-[11px] text-text-muted mt-2 italic">{preset.notes}</div>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
          ✗
        </Button>
      </div>

      {preset.fields.length > 0 && (
        <div className="mt-4 space-y-2">
          {preset.fields.map((f) => (
            <div key={f.key}>
              <TextField
                label={`${f.label}${f.required ? ' *' : ''}`}
                type={f.kind === 'secret' ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                disabled={submitting}
              />
              {f.help && <div className="text-[11px] text-text-muted mt-1">{f.help}</div>}
            </div>
          ))}
        </div>
      )}

      {preset.fields.length === 0 && (
        <div className="mt-4 text-[12px] text-text-muted">
          Este MCP no requiere configuración adicional.
        </div>
      )}

      {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}

      <div className="mt-4 flex items-center justify-between gap-2">
        <a
          href={preset.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-text-muted underline hover:text-text"
        >
          Docs ↗
        </a>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancelar
          </Button>
          <Button size="sm" variant="turtle" onClick={install} disabled={submitting || !canSubmit}>
            {submitting ? '…' : `+ Instalar ${preset.label}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
