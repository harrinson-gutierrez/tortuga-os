export interface FigmaTarget {
  fileKey: string
  nodeId: string | null
}

/**
 * Parse a Figma file/design URL into its fileKey and (optional) nodeId.
 * Accepts both `/design/:key/...` and `/file/:key/...` forms. The
 * `node-id` query param uses `-` as the node separator in URLs; Figma's
 * own APIs expect `:`, so we normalize it (e.g. `10-20` → `10:20`).
 *
 * Returns null when the URL is not a recognizable Figma file URL.
 */
export function parseFigmaUrl(raw: string): FigmaTarget | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!/(^|\.)figma\.com$/.test(url.hostname)) return null
  const match = url.pathname.match(/\/(?:design|file)\/([a-zA-Z0-9]+)/)
  if (!match?.[1]) return null
  const fileKey = match[1]
  const rawNode = url.searchParams.get('node-id')
  const nodeId = rawNode ? rawNode.replace(/-/g, ':') : null
  return { fileKey, nodeId }
}
