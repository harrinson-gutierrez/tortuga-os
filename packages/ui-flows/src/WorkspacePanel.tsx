import type { ApiClient } from '@tortuga-os/api-client'
import type { WorkspaceFileDTO, WorkspaceNodeDTO } from '@tortuga-os/contracts'
import { Button, Card, Eyebrow } from '@tortuga-os/ui'
import { useMemo, useState } from 'react'
import { useAsyncData } from './useAsyncData'

export interface WorkspacePanelProps {
  client: ApiClient
  projectCode: string
  refreshKey?: number
  /** Optional path to auto-select on first render (e.g., last agent run). */
  preselectPath?: string | null
}

export function WorkspacePanel({
  client,
  projectCode,
  refreshKey = 0,
  preselectPath = null,
}: WorkspacePanelProps) {
  const tree = useAsyncData(
    () => client.workspace.getTree(projectCode),
    [client, projectCode, refreshKey],
  )
  const [selectedPath, setSelectedPath] = useState<string | null>(preselectPath)

  const file = useAsyncData(
    () =>
      selectedPath ? client.workspace.readFile(projectCode, selectedPath) : Promise.resolve(null),
    [client, projectCode, selectedPath, refreshKey],
  )

  async function ensure() {
    await client.workspace.ensure(projectCode)
    tree.refetch()
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-medium text-[18px] tracking-tighter-2 m-0">
          Archivos del proyecto
        </h3>
        {tree.data && !tree.data.root && (
          <Button size="sm" onClick={ensure}>
            ▶ Crear workspace
          </Button>
        )}
      </div>

      {tree.error && <div className="mt-3 text-[12px] text-danger">{tree.error}</div>}

      {tree.data && !tree.data.root && (
        <div className="mt-3 space-y-2">
          <div className="text-[12px] text-text-muted">
            Este proyecto no tiene workspace local en disco todavía. Crea uno para que el agente y
            los chequeos tengan dónde dejar archivos.
          </div>
          {tree.data.attemptedPath && (
            <div className="text-[10px] font-mono text-text-dim break-all">
              Buscado en: {tree.data.attemptedPath}
            </div>
          )}
        </div>
      )}

      {tree.data?.root && tree.data.tree.length === 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-[12px] text-text-muted">El workspace existe pero está vacío.</div>
          <div className="text-[10px] font-mono text-text-dim break-all">
            Ruta: {tree.data.root}
          </div>
        </div>
      )}

      {tree.data?.root && tree.data.tree.length > 0 && (
        <div className="mt-3 grid grid-cols-[260px_1fr] gap-3">
          <div className="border-r border-border pr-3 overflow-auto max-h-[420px]">
            <div className="text-[10px] font-mono text-text-dim uppercase tracking-eyebrow mb-2 truncate">
              {tree.data.root}
            </div>
            <TreeView
              nodes={tree.data.tree}
              selectedPath={selectedPath}
              onSelect={(p) => setSelectedPath(p)}
            />
          </div>
          <div className="min-w-0">
            <FileViewer
              file={file.data ?? null}
              loading={file.loading}
              selectedPath={selectedPath}
            />
          </div>
        </div>
      )}
    </Card>
  )
}

function TreeView({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: WorkspaceNodeDTO[]
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  if (nodes.length === 0) {
    return <div className="text-[12px] text-text-muted">Workspace vacío.</div>
  }
  return (
    <ul className="m-0 p-0 list-none">
      {nodes.map((n) => (
        <TreeNode key={n.path} node={n} selectedPath={selectedPath} onSelect={onSelect} depth={0} />
      ))}
    </ul>
  )
}

function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
}: {
  node: WorkspaceNodeDTO
  selectedPath: string | null
  onSelect: (path: string) => void
  depth: number
}) {
  const [open, setOpen] = useState(depth < 1)
  const padding = { paddingLeft: `${depth * 12}px` }
  if (node.type === 'dir') {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full text-left py-1 text-[12px] text-text-muted hover:text-text font-mono flex items-center gap-1"
          style={padding}
        >
          <span>{open ? '▾' : '▸'}</span>
          <span>{node.name || '/'}</span>
        </button>
        {open && (
          <ul className="m-0 p-0 list-none">
            {node.children.map((c) => (
              <TreeNode
                key={c.path}
                node={c}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }
  const isSel = node.path === selectedPath
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={`w-full text-left py-1 text-[12px] font-mono flex items-center gap-1 ${isSel ? 'text-brand bg-bg-alt' : 'text-text hover:bg-bg-alt'}`}
        style={padding}
      >
        <span>📄</span>
        <span className="truncate">{node.name}</span>
      </button>
    </li>
  )
}

function FileViewer({
  file,
  loading,
  selectedPath,
}: {
  file: WorkspaceFileDTO | null
  loading: boolean
  selectedPath: string | null
}) {
  const ext = useMemo(
    () => (selectedPath ? (selectedPath.split('.').pop()?.toLowerCase() ?? '') : ''),
    [selectedPath],
  )
  const isMarkdown = ext === 'md'
  if (!selectedPath) {
    return <div className="text-[12px] text-text-muted">Selecciona un archivo a la izquierda.</div>
  }
  if (loading) {
    return <div className="text-[12px] text-text-muted">Cargando…</div>
  }
  if (!file) {
    return <div className="text-[12px] text-text-muted">No se pudo leer el archivo.</div>
  }
  return (
    <div>
      <Eyebrow>{file.path}</Eyebrow>
      <div className="mt-2 text-[10px] text-text-muted font-mono">
        {file.sizeBytes} bytes
        {file.truncated && <span className="ml-2 text-warning">(truncado)</span>}
        {file.binary && <span className="ml-2 text-warning">(binario)</span>}
      </div>
      {file.binary ? (
        <div className="mt-3 text-[12px] text-text-muted italic">
          Archivo binario — no se puede previsualizar aquí.
        </div>
      ) : (
        <pre
          className={`mt-3 text-[12px] font-mono whitespace-pre-wrap text-text-soft bg-bg-alt border border-border rounded-md px-3 py-2 max-h-[400px] overflow-auto ${isMarkdown ? 'leading-snug' : ''}`}
        >
          {file.content}
        </pre>
      )}
    </div>
  )
}
