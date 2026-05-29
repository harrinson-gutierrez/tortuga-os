import { INBOX_KINDS } from '@tortuga-os/domain'
import { z } from 'zod'

export const InboxKind = z.enum(INBOX_KINDS)
export type InboxKind = z.infer<typeof InboxKind>

export const CreateInboxItemInput = z.object({
  kind: InboxKind,
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional(),
  projectId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
})
export type CreateInboxItemInput = z.infer<typeof CreateInboxItemInput>
