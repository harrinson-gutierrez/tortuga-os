/**
 * Universal operator inbox: a single timeline of system events
 * (agent runs finishing, gates failing, releases built). Items are
 * enqueued internally by other subsystems and dismissed by the operator
 * from the InboxPanel. `enqueueInboxItem` is fire-and-forget for callers:
 * it returns the row directly (not a UseCaseResult) because the
 * subsystems calling it shouldn't have their main flow blocked by an
 * inbox enqueue failure — wrap in try/catch at the call site if needed.
 */

import type { CreateInboxItemInput, InboxItemDTO } from '@tortuga-os/contracts'
import type { CoreDeps } from '../deps'
import { type UseCaseResult, notFound, ucOk } from '../errors'
import { inboxItemDTO } from '../mappers'

export interface ListInboxFilters {
  unreadOnly?: boolean
  projectId?: string
}

export async function listInboxItems(
  { storage }: CoreDeps,
  filters?: ListInboxFilters,
): Promise<UseCaseResult<InboxItemDTO[]>> {
  const rows = await storage.listInboxItems(filters)
  return ucOk(rows.map(inboxItemDTO))
}

export async function countUnread(
  { storage }: CoreDeps,
  filters?: { projectId?: string },
): Promise<UseCaseResult<{ count: number }>> {
  const count = await storage.countUnreadInboxItems(filters)
  return ucOk({ count })
}

export async function markRead(
  { storage, now }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getInboxItemById(id)
  if (!existing) return notFound('inbox_item', id)
  await storage.markInboxItemRead(id, now())
  return ucOk({ ok: true })
}

export async function markAllRead(
  { storage, now }: CoreDeps,
  filters?: { projectId?: string },
): Promise<UseCaseResult<{ ok: true }>> {
  await storage.markAllInboxItemsRead(now(), filters)
  return ucOk({ ok: true })
}

export async function dismissItem(
  { storage }: CoreDeps,
  id: string,
): Promise<UseCaseResult<{ ok: true }>> {
  const existing = await storage.getInboxItemById(id)
  if (!existing) return notFound('inbox_item', id)
  await storage.deleteInboxItem(id)
  return ucOk({ ok: true })
}

/**
 * Internal API: enqueue an inbox item from another subsystem.
 * Returns the raw row (not UseCaseResult). Callers should wrap in
 * try/catch — a failed enqueue must not break the parent flow.
 */
export async function enqueueInboxItem(
  { storage, newId, now }: CoreDeps,
  input: CreateInboxItemInput,
): Promise<InboxItemDTO> {
  const row = await storage.createInboxItem({
    id: newId(),
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    runId: input.runId ?? null,
    now: now(),
  })
  return inboxItemDTO(row)
}
