/**
 * Drizzle/better-sqlite3 implementation of the Storage port from
 * @tortuga-os/core.
 *
 * Method names mirror the port one-for-one. Transactions use the
 * synchronous Drizzle transaction API of better-sqlite3 (Promise.resolve
 * around the result keeps the port's async signature consistent).
 */

import type {
  AgentRunRow,
  ApproveQuoteArgs,
  ClientRow,
  CloseAgentRunSucceededArgs,
  CloseAgentRunUnsuccessfulArgs,
  CreateAgentRunArgs,
  CreateEvidenceArgs,
  CreateExpenseArgs,
  CreateGateArgs,
  CreateInboxItemArgs,
  CreateKitTemplateArgs,
  CreateProjectArgs,
  CreateProjectEnvArgs,
  CreateProjectMcpArgs,
  CreateQuoteItemArgs,
  CreateQuoteMilestoneArgs,
  CreateQuoteModuleArgs,
  CreateSecretArgs,
  CreateTaskArgs,
  CreateTroubleshootReportArgs,
  DiscoveryConversationRow,
  DiscoveryMessageRow,
  EvidenceRow,
  ExpenseRow,
  GateRow,
  InboxItemRow,
  IterationRow,
  KitTemplateRow,
  LogWorkEntryArgs,
  PatchExpenseArgs,
  PatchKitTemplateArgs,
  PatchProjectEnvArgs,
  PatchProjectMcpArgs,
  PatchQuoteItemArgs,
  PatchQuoteMilestoneArgs,
  PatchQuoteModuleArgs,
  PatchSecretArgs,
  PatchTroubleshootReportArgs,
  PersonRow,
  PhaseRow,
  ProjectEnvRow,
  ProjectMcpRow,
  ProjectRoleRateRow,
  ProjectRow,
  QuoteItemRow,
  QuoteMilestoneRow,
  QuoteModuleRow,
  QuoteRow,
  RecordGateOutcomeArgs,
  RequestQuoteChangesArgs,
  RoleRateRow,
  SecretRow,
  StepAckRow,
  Storage,
  StoryRow,
  TaskRow,
  TroubleshootReportRow,
  UpdateTaskStatusArgs,
  UpsertStepAckArgs,
  WorkEntryRow,
} from '@tortuga-os/core'
import type {
  AgentRunStatus,
  GateType,
  PhaseType,
  ProjectEnvironment,
  TroubleshootStatus,
} from '@tortuga-os/domain'
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { Db } from './client'
import {
  agentRuns,
  clients,
  discoveryConversations,
  discoveryMessages,
  evidence,
  expenses,
  gates,
  inboxItems,
  iterations,
  kitTemplates,
  people,
  phases,
  projectEnvs,
  projectMcps,
  projectRoleRates,
  projects,
  quoteItems,
  quoteMilestones,
  quoteModules,
  quotes,
  roles as rolesTable,
  secrets,
  stepAcks,
  stories,
  tasks,
  troubleshootReports,
  workEntries,
} from './schema'

const PROJECT_TIMESTAMP_FIELDS = {
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
} as const

function computeItemSubtotalCents(hoursMin: number, rateCents: number, marginBps: number): number {
  const baseCents = (hoursMin * rateCents) / 60
  const marginMultiplier = 1 + marginBps / 10000
  return Math.round(baseCents * marginMultiplier)
}

export function createSqliteStorage(db: Db): Storage {
  return {
    async listClients() {
      return db.select().from(clients).where(isNull(clients.deletedAt)).all() as ClientRow[]
    },

    async getClientById(id) {
      const row = await db
        .select()
        .from(clients)
        .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
        .get()
      return (row ?? null) as ClientRow | null
    },

    async createClient(input) {
      await db.insert(clients).values({
        id: input.id,
        name: input.name,
        taxId: input.taxId,
        contactEmail: input.contactEmail,
        driveFolderId: input.driveFolderId,
      })
      const row = await db.select().from(clients).where(eq(clients.id, input.id)).get()
      return row as ClientRow
    },

    async patchClient(id, patch, now) {
      await db
        .update(clients)
        .set({ ...patch, updatedAt: now })
        .where(eq(clients.id, id))
      const row = await db.select().from(clients).where(eq(clients.id, id)).get()
      return row as ClientRow
    },

    async softDeleteClient(id, now) {
      await db.update(clients).set({ deletedAt: now }).where(eq(clients.id, id))
    },

    async listTrashedClients() {
      return db
        .select()
        .from(clients)
        .where(isNotNull(clients.deletedAt))
        .orderBy(desc(clients.deletedAt))
        .all() as ClientRow[]
    },

    async restoreClient(id, now) {
      await db
        .update(clients)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(clients.id, id))
        .run()
      const row = await db.select().from(clients).where(eq(clients.id, id)).get()
      return (row ?? null) as ClientRow | null
    },

    async countActiveProjectsForClient(clientId) {
      const rows = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.clientId, clientId), isNull(projects.deletedAt)))
        .all()
      return rows.length
    },

    async listPeople() {
      return db.select().from(people).where(isNull(people.deletedAt)).all() as PersonRow[]
    },

    async getPersonById(id) {
      const row = await db
        .select()
        .from(people)
        .where(and(eq(people.id, id), isNull(people.deletedAt)))
        .get()
      return (row ?? null) as PersonRow | null
    },

    async createPerson(input) {
      await db.insert(people).values({
        id: input.id,
        name: input.name,
        email: input.email,
      })
      const row = await db.select().from(people).where(eq(people.id, input.id)).get()
      return row as PersonRow
    },

    async patchPerson(id, patch, now) {
      await db
        .update(people)
        .set({ ...patch, updatedAt: now })
        .where(eq(people.id, id))
      const row = await db.select().from(people).where(eq(people.id, id)).get()
      return row as PersonRow
    },

    async softDeletePerson(id, now) {
      await db.update(people).set({ deletedAt: now }).where(eq(people.id, id))
    },

    async listTrashedPeople() {
      return db
        .select()
        .from(people)
        .where(isNotNull(people.deletedAt))
        .orderBy(desc(people.deletedAt))
        .all() as PersonRow[]
    },

    async restorePerson(id, now) {
      await db
        .update(people)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(people.id, id))
        .run()
      const row = await db.select().from(people).where(eq(people.id, id)).get()
      return (row ?? null) as PersonRow | null
    },

    async listProjectsWithClient() {
      const rows = await db
        .select({ project: projects, client: clients })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(and(isNull(projects.deletedAt), isNull(clients.deletedAt)))
        .all()
      return rows as Array<{ project: ProjectRow; client: ClientRow }>
    },

    async getProjectById(id) {
      const row = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
        .get()
      return (row ?? null) as ProjectRow | null
    },

    async getProjectByCode(code) {
      const row = await db
        .select({ project: projects, client: clients })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(and(eq(projects.code, code), isNull(projects.deletedAt)))
        .get()
      return (row ?? null) as { project: ProjectRow; client: ClientRow } | null
    },

    async createProjectWithSalesPhase(args: CreateProjectArgs) {
      db.transaction((tx) => {
        tx.insert(projects)
          .values({
            id: args.id,
            code: args.code,
            clientId: args.clientId,
            name: args.name,
            description: args.description,
            status: 'draft',
            currency: args.currency,
            startedAt: args.now,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
        tx.insert(phases)
          .values({
            id: args.salesPhaseId,
            projectId: args.id,
            type: 'F1_SALES',
            status: 'in_progress',
            ownerRole: 'sales',
            iteration: 1,
            startedAt: args.now,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
        tx.insert(quotes)
          .values({
            id: args.firstQuoteId,
            phaseId: args.salesPhaseId,
            version: 1,
            status: 'draft',
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
      })
      const row = await db.select().from(projects).where(eq(projects.id, args.id)).get()
      return row as ProjectRow
    },

    async patchProject(id, patch, now) {
      await db
        .update(projects)
        .set({ ...patch, updatedAt: now })
        .where(eq(projects.id, id))
      const row = await db.select().from(projects).where(eq(projects.id, id)).get()
      return row as ProjectRow
    },

    async softDeleteProject(id, now) {
      await db.update(projects).set({ deletedAt: now }).where(eq(projects.id, id))
    },

    async listTrashedProjects() {
      const rows = await db
        .select({ project: projects, client: clients })
        .from(projects)
        .innerJoin(clients, eq(clients.id, projects.clientId))
        .where(isNotNull(projects.deletedAt))
        .orderBy(desc(projects.deletedAt))
        .all()
      return rows as Array<{ project: ProjectRow; client: ClientRow }>
    },

    async restoreProject(id, now) {
      await db
        .update(projects)
        .set({ deletedAt: null, updatedAt: now })
        .where(eq(projects.id, id))
        .run()
      const row = await db.select().from(projects).where(eq(projects.id, id)).get()
      return (row ?? null) as ProjectRow | null
    },

    async getPhaseById(id) {
      const row = await db.select().from(phases).where(eq(phases.id, id)).get()
      return (row ?? null) as PhaseRow | null
    },

    async getPhasesForProject(projectId) {
      return db.select().from(phases).where(eq(phases.projectId, projectId)).all() as PhaseRow[]
    },

    async getSalesPhase(projectId) {
      const row = await db
        .select()
        .from(phases)
        .where(and(eq(phases.projectId, projectId), eq(phases.type, 'F1_SALES')))
        .get()
      return (row ?? null) as PhaseRow | null
    },

    async updatePhaseStatus(args) {
      await db
        .update(phases)
        .set({
          status: args.status,
          closedAt: args.closedAt,
          updatedAt: args.now,
        })
        .where(eq(phases.id, args.phaseId))
        .run()
      const row = await db.select().from(phases).where(eq(phases.id, args.phaseId)).get()
      if (!row) throw new Error(`phase ${args.phaseId} not found after status update`)
      return row as PhaseRow
    },

    async getQuoteById(id) {
      const row = await db.select().from(quotes).where(eq(quotes.id, id)).get()
      return (row ?? null) as QuoteRow | null
    },

    async listQuotesForSalesPhase(phaseId) {
      return db
        .select()
        .from(quotes)
        .where(eq(quotes.phaseId, phaseId))
        .orderBy(desc(quotes.version))
        .all() as QuoteRow[]
    },

    async getLatestQuoteForSalesPhase(phaseId) {
      const row = await db
        .select()
        .from(quotes)
        .where(eq(quotes.phaseId, phaseId))
        .orderBy(desc(quotes.version))
        .get()
      return (row ?? null) as QuoteRow | null
    },

    async patchQuote(id, patch, now) {
      await db
        .update(quotes)
        .set({ ...patch, updatedAt: now })
        .where(eq(quotes.id, id))
      const row = await db.select().from(quotes).where(eq(quotes.id, id)).get()
      return row as QuoteRow
    },

    async updateQuoteStatus(id, status, now) {
      await db.update(quotes).set({ status, updatedAt: now }).where(eq(quotes.id, id))
      const row = await db.select().from(quotes).where(eq(quotes.id, id)).get()
      return row as QuoteRow
    },

    async approveQuoteAndOpenKickoff(args: ApproveQuoteArgs) {
      const existing = await db.select().from(quotes).where(eq(quotes.id, args.quoteId)).get()
      if (!existing) throw new Error(`quote ${args.quoteId} not found at approve time`)
      const phase = await db.select().from(phases).where(eq(phases.id, existing.phaseId)).get()
      if (!phase) throw new Error(`phase ${existing.phaseId} not found at approve time`)

      db.transaction((tx) => {
        tx.update(quotes)
          .set({ status: 'approved', approvedAt: args.now, updatedAt: args.now })
          .where(eq(quotes.id, args.quoteId))
          .run()
        tx.update(phases)
          .set({ status: 'approved', closedAt: args.now, updatedAt: args.now })
          .where(eq(phases.id, phase.id))
          .run()
        tx.update(projects)
          .set({ status: 'active', updatedAt: args.now })
          .where(eq(projects.id, phase.projectId))
          .run()
        tx.insert(phases)
          .values({
            id: args.kickoffPhaseId,
            projectId: phase.projectId,
            type: 'F2_KICKOFF',
            status: 'pending',
            ownerRole: 'pm',
            iteration: 1,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
      })
      const row = await db.select().from(quotes).where(eq(quotes.id, args.quoteId)).get()
      return row as QuoteRow
    },

    async requestQuoteChanges(args: RequestQuoteChangesArgs) {
      const existing = await db.select().from(quotes).where(eq(quotes.id, args.oldQuoteId)).get()
      if (!existing) throw new Error(`quote ${args.oldQuoteId} not found at request_changes time`)

      db.transaction((tx) => {
        tx.update(quotes)
          .set({ status: 'changes_requested', updatedAt: args.now })
          .where(eq(quotes.id, args.oldQuoteId))
          .run()
        tx.insert(quotes)
          .values({
            id: args.newQuoteId,
            phaseId: existing.phaseId,
            version: args.newVersion,
            status: 'draft',
            totalHoursMin: args.totalHoursMin,
            totalCostCents: args.totalCostCents,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
      })
      const row = await db.select().from(quotes).where(eq(quotes.id, args.newQuoteId)).get()
      return row as QuoteRow
    },

    async getStoryById(id) {
      const row = await db.select().from(stories).where(eq(stories.id, id)).get()
      return (row ?? null) as StoryRow | null
    },

    async getStoryByCode(code) {
      const row = await db.select().from(stories).where(eq(stories.code, code)).get()
      return (row ?? null) as StoryRow | null
    },

    async listStoriesForQuote(quoteId) {
      return db
        .select()
        .from(stories)
        .where(eq(stories.quoteId, quoteId))
        .orderBy(asc(stories.priority), asc(stories.code))
        .all() as StoryRow[]
    },

    async createStory(input) {
      await db.insert(stories).values({
        id: input.id,
        quoteId: input.quoteId,
        code: input.code,
        title: input.title,
        goal: input.goal,
        acceptanceCriteriaJson: input.acceptanceCriteriaJson,
        inputsJson: input.inputsJson,
        outputsJson: input.outputsJson,
        verificationJson: input.verificationJson,
        outOfScopeJson: input.outOfScopeJson,
        estimatedHoursMin: input.estimatedHoursMin,
        actualHoursMin: input.actualHoursMin,
        status: input.status,
        priority: input.priority,
        ownerRole: input.ownerRole,
        createdAt: input.now,
        updatedAt: input.now,
      })
      const row = await db.select().from(stories).where(eq(stories.id, input.id)).get()
      return row as StoryRow
    },

    async patchStory(id, patch, now) {
      await db
        .update(stories)
        .set({ ...patch, updatedAt: now })
        .where(eq(stories.id, id))
      const row = await db.select().from(stories).where(eq(stories.id, id)).get()
      return row as StoryRow
    },

    async updateStoryStatus(args) {
      await db
        .update(stories)
        .set({ status: args.status, updatedAt: args.now })
        .where(eq(stories.id, args.storyId))
        .run()
      const row = await db.select().from(stories).where(eq(stories.id, args.storyId)).get()
      if (!row) throw new Error(`story ${args.storyId} not found after status update`)
      return row as StoryRow
    },

    async getTaskById(id) {
      const row = await db.select().from(tasks).where(eq(tasks.id, id)).get()
      return (row ?? null) as TaskRow | null
    },

    async getTaskByCode(code) {
      const row = await db.select().from(tasks).where(eq(tasks.code, code)).get()
      return (row ?? null) as TaskRow | null
    },

    async listTasksForStory(storyId) {
      return db
        .select()
        .from(tasks)
        .where(eq(tasks.storyId, storyId))
        .orderBy(asc(tasks.code))
        .all() as TaskRow[]
    },

    async createTaskWithFirstIteration(args: CreateTaskArgs) {
      db.transaction((tx) => {
        tx.insert(tasks)
          .values({
            id: args.id,
            code: args.code,
            storyId: args.storyId,
            type: args.type,
            ownerRole: args.ownerRole,
            assignee: args.assignee,
            status: 'pending',
            currentIteration: 1,
            estimatedHoursMin: args.estimatedHoursMin,
            actualHoursMin: 0,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
        tx.insert(iterations)
          .values({
            id: args.initialIterationId,
            taskId: args.id,
            n: 1,
            startedAt: args.now,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
      })
      const row = await db.select().from(tasks).where(eq(tasks.id, args.id)).get()
      return row as TaskRow
    },

    async patchTask(id, patch, now) {
      await db
        .update(tasks)
        .set({ ...patch, updatedAt: now })
        .where(eq(tasks.id, id))
      const row = await db.select().from(tasks).where(eq(tasks.id, id)).get()
      return row as TaskRow
    },

    async updateTaskStatus(args: UpdateTaskStatusArgs) {
      const update: Record<string, unknown> = {
        status: args.status,
        updatedAt: args.now,
      }
      if (args.currentIteration !== undefined) {
        update.currentIteration = args.currentIteration
      }
      await db.update(tasks).set(update).where(eq(tasks.id, args.taskId))
      const row = await db.select().from(tasks).where(eq(tasks.id, args.taskId)).get()
      return row as TaskRow
    },

    async closeIterationAndAdvanceTask(args) {
      db.transaction((tx) => {
        tx.update(iterations)
          .set({
            closedAt: args.close.now,
            outcome: args.close.outcome,
            closedByRole: args.close.closedByRole,
            notes: args.close.notes,
            updatedAt: args.close.now,
          })
          .where(eq(iterations.id, args.close.iterationId))
          .run()

        const taskUpdate: Record<string, unknown> = {
          status: args.taskUpdate.status,
          updatedAt: args.taskUpdate.now,
        }
        if (args.taskUpdate.currentIteration !== undefined) {
          taskUpdate.currentIteration = args.taskUpdate.currentIteration
        }
        tx.update(tasks).set(taskUpdate).where(eq(tasks.id, args.taskUpdate.taskId)).run()

        if (args.nextIteration) {
          tx.insert(iterations)
            .values({
              id: args.nextIteration.iterationId,
              taskId: args.nextIteration.taskId,
              n: args.nextIteration.n,
              startedAt: args.nextIteration.now,
              createdAt: args.nextIteration.now,
              updatedAt: args.nextIteration.now,
            })
            .run()
        }
      })
      const row = await db.select().from(tasks).where(eq(tasks.id, args.taskUpdate.taskId)).get()
      return row as TaskRow
    },

    async getIterationById(id) {
      const row = await db.select().from(iterations).where(eq(iterations.id, id)).get()
      return (row ?? null) as IterationRow | null
    },

    async listIterationsForTask(taskId) {
      return db
        .select()
        .from(iterations)
        .where(eq(iterations.taskId, taskId))
        .orderBy(desc(iterations.n))
        .all() as IterationRow[]
    },

    async getCurrentIteration(taskId) {
      const task = await db
        .select({ currentIteration: tasks.currentIteration })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .get()
      if (!task) return null
      const row = await db
        .select()
        .from(iterations)
        .where(and(eq(iterations.taskId, taskId), eq(iterations.n, task.currentIteration)))
        .get()
      return (row ?? null) as IterationRow | null
    },

    async listWorkEntriesForTask(taskId) {
      return db
        .select()
        .from(workEntries)
        .where(eq(workEntries.taskId, taskId))
        .orderBy(desc(workEntries.loggedAt))
        .all() as WorkEntryRow[]
    },

    async listWorkEntriesForIteration(iterationId) {
      return db
        .select()
        .from(workEntries)
        .where(eq(workEntries.iterationId, iterationId))
        .orderBy(desc(workEntries.loggedAt))
        .all() as WorkEntryRow[]
    },

    async logWorkEntry(args: LogWorkEntryArgs) {
      const task = await db
        .select({ actualHoursMin: tasks.actualHoursMin })
        .from(tasks)
        .where(eq(tasks.id, args.taskId))
        .get()
      if (!task) throw new Error(`task ${args.taskId} not found at logWorkEntry time`)

      db.transaction((tx) => {
        tx.insert(workEntries)
          .values({
            id: args.id,
            iterationId: args.iterationId,
            taskId: args.taskId,
            personId: args.personId,
            role: args.role,
            minutes: args.minutes,
            reworkTicketId: args.reworkTicketId,
            notes: args.notes,
            loggedAt: args.loggedAt,
            createdAt: args.now,
            updatedAt: args.now,
          })
          .run()
        tx.update(tasks)
          .set({
            actualHoursMin: task.actualHoursMin + args.minutes,
            updatedAt: args.now,
          })
          .where(eq(tasks.id, args.taskId))
          .run()
      })
      const row = await db.select().from(workEntries).where(eq(workEntries.id, args.id)).get()
      return row as WorkEntryRow
    },

    async getTaskTotalMinutes(taskId) {
      const row = await db
        .select({ total: sql<number>`COALESCE(SUM(${workEntries.minutes}), 0)` })
        .from(workEntries)
        .where(eq(workEntries.taskId, taskId))
        .get()
      return Number(row?.total ?? 0)
    },

    async getGateById(id) {
      const row = await db.select().from(gates).where(eq(gates.id, id)).get()
      return (row ?? null) as GateRow | null
    },

    async listGatesForIteration(iterationId) {
      return db
        .select()
        .from(gates)
        .where(eq(gates.iterationId, iterationId))
        .orderBy(asc(gates.gateType))
        .all() as GateRow[]
    },

    async countGateForIteration(iterationId, gateType: GateType) {
      const rows = await db
        .select({ id: gates.id })
        .from(gates)
        .where(and(eq(gates.iterationId, iterationId), eq(gates.gateType, gateType)))
        .all()
      return rows.length
    },

    async createGate(args: CreateGateArgs) {
      await db.insert(gates).values({
        id: args.id,
        taskId: args.taskId,
        iterationId: args.iterationId,
        gateType: args.gateType,
        status: 'pending',
        createdAt: args.now,
        updatedAt: args.now,
      })
      const row = await db.select().from(gates).where(eq(gates.id, args.id)).get()
      return row as GateRow
    },

    async recordGateOutcome(args: RecordGateOutcomeArgs) {
      await db
        .update(gates)
        .set({
          status: args.status,
          outputPath: args.outputPath,
          ranAt: args.now,
          updatedAt: args.now,
        })
        .where(eq(gates.id, args.gateId))
      const row = await db.select().from(gates).where(eq(gates.id, args.gateId)).get()
      return row as GateRow
    },

    async deleteGatesForIteration(args: { iterationId: string; types: GateType[] }) {
      if (args.types.length === 0) return 0
      const result = await db
        .delete(gates)
        .where(and(eq(gates.iterationId, args.iterationId), inArray(gates.gateType, args.types)))
        .run()
      return result.changes ?? 0
    },

    async getEvidenceById(id) {
      const row = await db.select().from(evidence).where(eq(evidence.id, id)).get()
      return (row ?? null) as EvidenceRow | null
    },

    async listEvidenceForIteration(iterationId) {
      return db
        .select()
        .from(evidence)
        .where(eq(evidence.iterationId, iterationId))
        .orderBy(asc(evidence.createdAt))
        .all() as EvidenceRow[]
    },

    async createEvidence(args: CreateEvidenceArgs) {
      await db.insert(evidence).values({
        id: args.id,
        taskId: args.taskId,
        iterationId: args.iterationId,
        type: args.type,
        kind: args.kind,
        path: args.path,
        createdByRole: args.createdByRole,
        createdByAssignee: args.createdByAssignee,
        notes: args.notes,
        createdAt: args.now,
        updatedAt: args.now,
      })
      const row = await db.select().from(evidence).where(eq(evidence.id, args.id)).get()
      return row as EvidenceRow
    },

    async listDefaultRoleRates() {
      return db.select().from(rolesTable).all() as RoleRateRow[]
    },

    async listProjectRoleRates(projectId) {
      return db
        .select()
        .from(projectRoleRates)
        .where(eq(projectRoleRates.projectId, projectId))
        .all() as ProjectRoleRateRow[]
    },

    async listProjectWorkEntriesWithPhase(projectId) {
      const rows = await db
        .select()
        .from(workEntries)
        .innerJoin(tasks, eq(tasks.id, workEntries.taskId))
        .innerJoin(stories, eq(stories.id, tasks.storyId))
        .innerJoin(quotes, eq(quotes.id, stories.quoteId))
        .innerJoin(phases, eq(phases.id, quotes.phaseId))
        .where(eq(phases.projectId, projectId))
        .all()
      void PROJECT_TIMESTAMP_FIELDS // keep the const for future use
      return rows.map((r) => ({
        entry: r.work_entries as WorkEntryRow,
        phase: 'F5_BUILD' as PhaseType,
      }))
    },

    async getAgentRunById(id) {
      const row = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).get()
      return (row ?? null) as AgentRunRow | null
    },

    async listAgentRunsForTask(taskId) {
      return db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.taskId, taskId))
        .orderBy(desc(agentRuns.createdAt))
        .all() as AgentRunRow[]
    },

    async listAgentRunsByStatus(status: AgentRunStatus) {
      return db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.status, status))
        .orderBy(asc(agentRuns.createdAt))
        .all() as AgentRunRow[]
    },

    async createAgentRun(args: CreateAgentRunArgs) {
      await db.insert(agentRuns).values({
        id: args.id,
        taskId: args.taskId,
        iterationId: args.iterationId,
        agentKind: args.agentKind,
        provider: args.provider,
        model: args.model,
        status: 'queued',
        systemPrompt: args.systemPrompt,
        userPrompt: args.userPrompt,
        createdAt: args.now,
        updatedAt: args.now,
      })
      const row = await db.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get()
      return row as AgentRunRow
    },

    async updateAgentRunStarted(args) {
      await db
        .update(agentRuns)
        .set({ status: 'running', startedAt: args.now, updatedAt: args.now })
        .where(eq(agentRuns.id, args.id))
      const row = await db.select().from(agentRuns).where(eq(agentRuns.id, args.id)).get()
      return row as AgentRunRow
    },

    async appendAgentRunOutput(args) {
      const current = await db
        .select({ output: agentRuns.output })
        .from(agentRuns)
        .where(eq(agentRuns.id, args.id))
        .get()
      const next = (current?.output ?? '') + args.chunk
      await db
        .update(agentRuns)
        .set({ output: next, updatedAt: args.now })
        .where(eq(agentRuns.id, args.id))
    },

    async closeAgentRunSucceeded(args: CloseAgentRunSucceededArgs) {
      const run = await db.select().from(agentRuns).where(eq(agentRuns.id, args.runId)).get()
      if (!run) throw new Error(`agent_run ${args.runId} not found at close`)
      const task = await db
        .select({ actualHoursMin: tasks.actualHoursMin })
        .from(tasks)
        .where(eq(tasks.id, run.taskId))
        .get()
      if (!task) throw new Error(`task ${run.taskId} not found at close`)

      const durationMs = Math.max(0, args.closedAt - args.startedAt)
      const minutes = Math.max(1, Math.round(durationMs / 60_000))

      db.transaction((tx) => {
        tx.insert(evidence)
          .values({
            id: args.evidenceId,
            taskId: run.taskId,
            iterationId: run.iterationId,
            type: 'dev',
            kind: 'gate_output',
            path: args.evidencePath,
            createdByRole: run.agentKind === 'qa' ? 'qa' : 'dev',
            createdByAssignee: `agent:${run.agentKind}`,
            notes: `claude-cli run ${args.runId} (${args.tokensIn}/${args.tokensOut} tokens, ${args.costCents}Â¢)`,
            createdAt: args.closedAt,
            updatedAt: args.closedAt,
          })
          .run()

        tx.insert(workEntries)
          .values({
            id: args.workEntryId,
            iterationId: run.iterationId,
            taskId: run.taskId,
            personId: args.botPersonId,
            role: run.agentKind === 'qa' ? 'qa' : 'dev',
            minutes,
            reworkTicketId: null,
            notes: `agent_run ${args.runId} (${run.agentKind})`,
            loggedAt: args.closedAt,
            createdAt: args.closedAt,
            updatedAt: args.closedAt,
          })
          .run()

        tx.update(tasks)
          .set({
            actualHoursMin: task.actualHoursMin + minutes,
            updatedAt: args.closedAt,
          })
          .where(eq(tasks.id, run.taskId))
          .run()

        tx.update(agentRuns)
          .set({
            status: 'succeeded',
            output: args.output,
            tokensIn: args.tokensIn,
            tokensOut: args.tokensOut,
            costCents: args.costCents,
            startedAt: args.startedAt,
            closedAt: args.closedAt,
            workEntryId: args.workEntryId,
            evidenceId: args.evidenceId,
            updatedAt: args.closedAt,
          })
          .where(eq(agentRuns.id, args.runId))
          .run()
      })

      const row = await db.select().from(agentRuns).where(eq(agentRuns.id, args.runId)).get()
      return row as AgentRunRow
    },

    async closeAgentRunUnsuccessful(args: CloseAgentRunUnsuccessfulArgs) {
      await db
        .update(agentRuns)
        .set({
          status: args.status,
          errorMessage: args.errorMessage,
          output: args.output,
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          costCents: args.costCents,
          startedAt: args.startedAt,
          closedAt: args.closedAt,
          updatedAt: args.closedAt,
        })
        .where(eq(agentRuns.id, args.runId))
      const row = await db.select().from(agentRuns).where(eq(agentRuns.id, args.runId)).get()
      return row as AgentRunRow
    },

    async getDiscoveryConversationById(id) {
      const row = await db
        .select()
        .from(discoveryConversations)
        .where(eq(discoveryConversations.id, id))
        .get()
      return (row as DiscoveryConversationRow | undefined) ?? null
    },

    async getActiveDiscoveryConversationForProject(projectId) {
      // "Active" here means anything not yet archived: an in-progress chat
      // (status='active') OR a converged conversation whose draft is still
      // waiting for the operator's approval (status='converged'). The UI
      // should resume both â€” only archived conversations are considered
      // finished and a new one can be started.
      //
      // Priority order: converged > active (most recent within each
      // bucket). A pending quote is more useful to surface than a half-
      // started chat the user may have abandoned.
      const rows = (await db
        .select()
        .from(discoveryConversations)
        .where(
          and(
            eq(discoveryConversations.projectId, projectId),
            ne(discoveryConversations.status, 'archived'),
          ),
        )
        .orderBy(desc(discoveryConversations.createdAt))
        .all()) as DiscoveryConversationRow[]
      if (rows.length === 0) return null
      const converged = rows.find((r) => r.status === 'converged')
      return converged ?? rows[0] ?? null
    },

    async createDiscoveryConversation(args) {
      await db
        .insert(discoveryConversations)
        .values({
          id: args.id,
          projectId: args.projectId,
          status: 'active',
          provider: args.provider,
          cliSessionId: null,
          storiesDraftJson: null,
          approvedAt: null,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db
        .select()
        .from(discoveryConversations)
        .where(eq(discoveryConversations.id, args.id))
        .get()
      return row as DiscoveryConversationRow
    },

    async setDiscoveryCliSessionId(args) {
      await db
        .update(discoveryConversations)
        .set({
          cliSessionId: args.cliSessionId,
          updatedAt: args.now,
        })
        .where(eq(discoveryConversations.id, args.conversationId))
        .run()
      const row = await db
        .select()
        .from(discoveryConversations)
        .where(eq(discoveryConversations.id, args.conversationId))
        .get()
      return row as DiscoveryConversationRow
    },

    async listDiscoveryMessages(conversationId) {
      return db
        .select()
        .from(discoveryMessages)
        .where(eq(discoveryMessages.conversationId, conversationId))
        .orderBy(asc(discoveryMessages.createdAt))
        .all() as DiscoveryMessageRow[]
    },

    async appendDiscoveryMessage(args) {
      await db
        .insert(discoveryMessages)
        .values({
          id: args.id,
          conversationId: args.conversationId,
          role: args.role,
          content: args.content,
          model: args.model,
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          costCents: args.costCents,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db
        .select()
        .from(discoveryMessages)
        .where(eq(discoveryMessages.id, args.id))
        .get()
      return row as DiscoveryMessageRow
    },

    async attachDiscoveryStoriesDraft(args) {
      await db
        .update(discoveryConversations)
        .set({
          storiesDraftJson: args.storiesDraftJson,
          status: 'converged',
          updatedAt: args.now,
        })
        .where(eq(discoveryConversations.id, args.conversationId))
        .run()
      const row = await db
        .select()
        .from(discoveryConversations)
        .where(eq(discoveryConversations.id, args.conversationId))
        .get()
      return row as DiscoveryConversationRow
    },

    async approveDiscoveryConversation(args) {
      await db
        .update(discoveryConversations)
        .set({
          status: 'archived',
          approvedAt: args.now,
          updatedAt: args.now,
        })
        .where(eq(discoveryConversations.id, args.conversationId))
        .run()
      const row = await db
        .select()
        .from(discoveryConversations)
        .where(eq(discoveryConversations.id, args.conversationId))
        .get()
      return row as DiscoveryConversationRow
    },

    async reopenDiscoveryConversation(args) {
      await db
        .update(discoveryConversations)
        .set({
          status: 'active',
          updatedAt: args.now,
        })
        .where(eq(discoveryConversations.id, args.conversationId))
        .run()
      const row = await db
        .select()
        .from(discoveryConversations)
        .where(eq(discoveryConversations.id, args.conversationId))
        .get()
      return row as DiscoveryConversationRow
    },

    async listQuoteModulesForProject(projectId: string) {
      return db
        .select()
        .from(quoteModules)
        .where(and(eq(quoteModules.projectId, projectId), isNull(quoteModules.deletedAt)))
        .orderBy(asc(quoteModules.sortOrder), asc(quoteModules.name))
        .all() as QuoteModuleRow[]
    },

    async getQuoteModuleById(id) {
      const row = await db
        .select()
        .from(quoteModules)
        .where(and(eq(quoteModules.id, id), isNull(quoteModules.deletedAt)))
        .get()
      return (row ?? null) as QuoteModuleRow | null
    },

    async createQuoteModule(args: CreateQuoteModuleArgs) {
      await db
        .insert(quoteModules)
        .values({
          id: args.id,
          projectId: args.projectId,
          name: args.name,
          description: args.description,
          defaultHoursJson: args.defaultHoursJson,
          defaultMarginBps: args.defaultMarginBps,
          sortOrder: args.sortOrder,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(quoteModules).where(eq(quoteModules.id, args.id)).get()
      if (!row) throw new Error(`quote_module ${args.id} not found after insert`)
      return row as QuoteModuleRow
    },

    async patchQuoteModule(args: PatchQuoteModuleArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.name !== undefined) updates.name = args.patch.name
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.defaultHoursJson !== undefined)
        updates.defaultHoursJson = args.patch.defaultHoursJson
      if (args.patch.defaultMarginBps !== undefined)
        updates.defaultMarginBps = args.patch.defaultMarginBps
      if (args.patch.sortOrder !== undefined) updates.sortOrder = args.patch.sortOrder
      await db.update(quoteModules).set(updates).where(eq(quoteModules.id, args.id)).run()
      const row = await db.select().from(quoteModules).where(eq(quoteModules.id, args.id)).get()
      if (!row) throw new Error(`quote_module ${args.id} not found after patch`)
      return row as QuoteModuleRow
    },

    async softDeleteQuoteModule(id, now) {
      await db
        .update(quoteModules)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(quoteModules.id, id))
        .run()
    },

    async listQuoteItems(quoteId: string) {
      return db
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, quoteId))
        .orderBy(asc(quoteItems.sortOrder), asc(quoteItems.createdAt))
        .all() as QuoteItemRow[]
    },

    async getQuoteItemById(id) {
      const row = await db.select().from(quoteItems).where(eq(quoteItems.id, id)).get()
      return (row ?? null) as QuoteItemRow | null
    },

    async createQuoteItem(args: CreateQuoteItemArgs) {
      const subtotalCents = computeItemSubtotalCents(args.hoursMin, args.rateCents, args.marginBps)
      await db
        .insert(quoteItems)
        .values({
          id: args.id,
          quoteId: args.quoteId,
          moduleId: args.moduleId,
          label: args.label,
          description: args.description,
          hoursMin: args.hoursMin,
          rateCents: args.rateCents,
          marginBps: args.marginBps,
          subtotalCents,
          sortOrder: args.sortOrder,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(quoteItems).where(eq(quoteItems.id, args.id)).get()
      if (!row) throw new Error(`quote_item ${args.id} not found after insert`)
      return row as QuoteItemRow
    },

    async patchQuoteItem(args: PatchQuoteItemArgs) {
      const existing = await db.select().from(quoteItems).where(eq(quoteItems.id, args.id)).get()
      if (!existing) throw new Error(`quote_item ${args.id} not found`)
      const next = {
        hoursMin: args.patch.hoursMin ?? existing.hoursMin,
        rateCents: args.patch.rateCents ?? existing.rateCents,
        marginBps: args.patch.marginBps ?? existing.marginBps,
      }
      const subtotalCents = computeItemSubtotalCents(next.hoursMin, next.rateCents, next.marginBps)
      const updates: Record<string, unknown> = { updatedAt: args.now, subtotalCents }
      if (args.patch.label !== undefined) updates.label = args.patch.label
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.hoursMin !== undefined) updates.hoursMin = args.patch.hoursMin
      if (args.patch.rateCents !== undefined) updates.rateCents = args.patch.rateCents
      if (args.patch.marginBps !== undefined) updates.marginBps = args.patch.marginBps
      if (args.patch.sortOrder !== undefined) updates.sortOrder = args.patch.sortOrder
      await db.update(quoteItems).set(updates).where(eq(quoteItems.id, args.id)).run()
      const row = await db.select().from(quoteItems).where(eq(quoteItems.id, args.id)).get()
      if (!row) throw new Error(`quote_item ${args.id} not found after patch`)
      return row as QuoteItemRow
    },

    async deleteQuoteItem(id) {
      await db.delete(quoteItems).where(eq(quoteItems.id, id)).run()
    },

    async recomputeQuoteTotals(quoteId: string, now: number) {
      const items = (await db
        .select()
        .from(quoteItems)
        .where(eq(quoteItems.quoteId, quoteId))
        .all()) as QuoteItemRow[]
      const totalHoursMin = items.reduce((acc, it) => acc + it.hoursMin, 0)
      const totalCostCents = items.reduce((acc, it) => acc + it.subtotalCents, 0)
      await db
        .update(quotes)
        .set({ totalHoursMin, totalCostCents, updatedAt: now })
        .where(eq(quotes.id, quoteId))
        .run()
      const row = await db.select().from(quotes).where(eq(quotes.id, quoteId)).get()
      if (!row) throw new Error(`quote ${quoteId} not found after totals recompute`)
      return row as QuoteRow
    },

    async listQuoteMilestones(quoteId: string) {
      return db
        .select()
        .from(quoteMilestones)
        .where(eq(quoteMilestones.quoteId, quoteId))
        .orderBy(asc(quoteMilestones.sortOrder), asc(quoteMilestones.createdAt))
        .all() as QuoteMilestoneRow[]
    },

    async getQuoteMilestoneById(id) {
      const row = await db.select().from(quoteMilestones).where(eq(quoteMilestones.id, id)).get()
      return (row ?? null) as QuoteMilestoneRow | null
    },

    async createQuoteMilestone(args: CreateQuoteMilestoneArgs) {
      await db
        .insert(quoteMilestones)
        .values({
          id: args.id,
          quoteId: args.quoteId,
          label: args.label,
          description: args.description,
          percentageBps: args.percentageBps,
          gateType: args.gateType,
          sortOrder: args.sortOrder,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db
        .select()
        .from(quoteMilestones)
        .where(eq(quoteMilestones.id, args.id))
        .get()
      if (!row) throw new Error(`quote_milestone ${args.id} not found after insert`)
      return row as QuoteMilestoneRow
    },

    async patchQuoteMilestone(args: PatchQuoteMilestoneArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.label !== undefined) updates.label = args.patch.label
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.percentageBps !== undefined) updates.percentageBps = args.patch.percentageBps
      if (args.patch.gateType !== undefined) updates.gateType = args.patch.gateType
      if (args.patch.sortOrder !== undefined) updates.sortOrder = args.patch.sortOrder
      await db.update(quoteMilestones).set(updates).where(eq(quoteMilestones.id, args.id)).run()
      const row = await db
        .select()
        .from(quoteMilestones)
        .where(eq(quoteMilestones.id, args.id))
        .get()
      if (!row) throw new Error(`quote_milestone ${args.id} not found after patch`)
      return row as QuoteMilestoneRow
    },

    async deleteQuoteMilestone(id) {
      await db.delete(quoteMilestones).where(eq(quoteMilestones.id, id)).run()
    },

    async listKitTemplates() {
      return db
        .select()
        .from(kitTemplates)
        .where(isNull(kitTemplates.deletedAt))
        .orderBy(asc(kitTemplates.name))
        .all() as KitTemplateRow[]
    },

    async getKitTemplateById(id) {
      const row = await db
        .select()
        .from(kitTemplates)
        .where(and(eq(kitTemplates.id, id), isNull(kitTemplates.deletedAt)))
        .get()
      return (row ?? null) as KitTemplateRow | null
    },

    async createKitTemplate(args: CreateKitTemplateArgs) {
      await db
        .insert(kitTemplates)
        .values({
          id: args.id,
          name: args.name,
          description: args.description,
          stack: args.stack,
          snapshotJson: args.snapshotJson,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(kitTemplates).where(eq(kitTemplates.id, args.id)).get()
      if (!row) throw new Error(`kit_template ${args.id} not found after insert`)
      return row as KitTemplateRow
    },

    async patchKitTemplate(args: PatchKitTemplateArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.name !== undefined) updates.name = args.patch.name
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.stack !== undefined) updates.stack = args.patch.stack
      if (args.patch.snapshotJson !== undefined) updates.snapshotJson = args.patch.snapshotJson
      await db.update(kitTemplates).set(updates).where(eq(kitTemplates.id, args.id)).run()
      const row = await db.select().from(kitTemplates).where(eq(kitTemplates.id, args.id)).get()
      if (!row) throw new Error(`kit_template ${args.id} not found after patch`)
      return row as KitTemplateRow
    },

    async softDeleteKitTemplate(id, now) {
      await db
        .update(kitTemplates)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(kitTemplates.id, id))
        .run()
    },

    async listExpensesForProject(projectId: string) {
      return db
        .select()
        .from(expenses)
        .where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
        .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt))
        .all() as ExpenseRow[]
    },

    async getExpenseById(id) {
      const row = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
        .get()
      return (row ?? null) as ExpenseRow | null
    },

    async createExpense(args: CreateExpenseArgs) {
      await db
        .insert(expenses)
        .values({
          id: args.id,
          projectId: args.projectId,
          category: args.category,
          vendor: args.vendor,
          description: args.description,
          amountCents: args.amountCents,
          incurredOn: args.incurredOn,
          receiptPath: args.receiptPath,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(expenses).where(eq(expenses.id, args.id)).get()
      if (!row) throw new Error(`expense ${args.id} not found after insert`)
      return row as ExpenseRow
    },

    async patchExpense(args: PatchExpenseArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.category !== undefined) updates.category = args.patch.category
      if (args.patch.vendor !== undefined) updates.vendor = args.patch.vendor
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.amountCents !== undefined) updates.amountCents = args.patch.amountCents
      if (args.patch.incurredOn !== undefined) updates.incurredOn = args.patch.incurredOn
      if (args.patch.receiptPath !== undefined) updates.receiptPath = args.patch.receiptPath
      await db.update(expenses).set(updates).where(eq(expenses.id, args.id)).run()
      const row = await db.select().from(expenses).where(eq(expenses.id, args.id)).get()
      if (!row) throw new Error(`expense ${args.id} not found after patch`)
      return row as ExpenseRow
    },

    async softDeleteExpense(id, now) {
      await db
        .update(expenses)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(expenses.id, id))
        .run()
    },

    async sumExpensesForProject(projectId: string) {
      const rows = (await db
        .select({ amount: expenses.amountCents })
        .from(expenses)
        .where(and(eq(expenses.projectId, projectId), isNull(expenses.deletedAt)))
        .all()) as Array<{ amount: number }>
      return rows.reduce((acc, r) => acc + r.amount, 0)
    },

    async listSecretsForProject(projectId: string) {
      return db
        .select()
        .from(secrets)
        .where(eq(secrets.projectId, projectId))
        .orderBy(asc(secrets.name))
        .all() as SecretRow[]
    },

    async getSecretById(id) {
      const row = await db.select().from(secrets).where(eq(secrets.id, id)).get()
      return (row ?? null) as SecretRow | null
    },

    async getSecretByName(projectId, name) {
      const row = await db
        .select()
        .from(secrets)
        .where(and(eq(secrets.projectId, projectId), eq(secrets.name, name)))
        .get()
      return (row ?? null) as SecretRow | null
    },

    async createSecret(args: CreateSecretArgs) {
      await db
        .insert(secrets)
        .values({
          id: args.id,
          projectId: args.projectId,
          name: args.name,
          description: args.description,
          valueCiphertext: args.valueCiphertext,
          iv: args.iv,
          authTag: args.authTag,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(secrets).where(eq(secrets.id, args.id)).get()
      if (!row) throw new Error(`secret ${args.id} not found after insert`)
      return row as SecretRow
    },

    async patchSecret(args: PatchSecretArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.valueCiphertext !== undefined)
        updates.valueCiphertext = args.patch.valueCiphertext
      if (args.patch.iv !== undefined) updates.iv = args.patch.iv
      if (args.patch.authTag !== undefined) updates.authTag = args.patch.authTag
      await db.update(secrets).set(updates).where(eq(secrets.id, args.id)).run()
      const row = await db.select().from(secrets).where(eq(secrets.id, args.id)).get()
      if (!row) throw new Error(`secret ${args.id} not found after patch`)
      return row as SecretRow
    },

    async deleteSecret(id) {
      await db.delete(secrets).where(eq(secrets.id, id)).run()
    },

    async listProjectMcps(projectId) {
      return db
        .select()
        .from(projectMcps)
        .where(and(eq(projectMcps.projectId, projectId), isNull(projectMcps.deletedAt)))
        .orderBy(asc(projectMcps.name))
        .all() as ProjectMcpRow[]
    },

    async getProjectMcpById(id) {
      const row = await db
        .select()
        .from(projectMcps)
        .where(and(eq(projectMcps.id, id), isNull(projectMcps.deletedAt)))
        .get()
      return (row ?? null) as ProjectMcpRow | null
    },

    async getProjectMcpByName(projectId, name) {
      const row = await db
        .select()
        .from(projectMcps)
        .where(
          and(
            eq(projectMcps.projectId, projectId),
            eq(projectMcps.name, name),
            isNull(projectMcps.deletedAt),
          ),
        )
        .get()
      return (row ?? null) as ProjectMcpRow | null
    },

    async createProjectMcp(args: CreateProjectMcpArgs) {
      // (project_id, name) is UNIQUE â€” revive the soft-deleted twin if any so
      // re-installing a preset for a project behaves as expected.
      const existingByName = await db
        .select()
        .from(projectMcps)
        .where(and(eq(projectMcps.projectId, args.projectId), eq(projectMcps.name, args.name)))
        .get()
      if (existingByName) {
        await db
          .update(projectMcps)
          .set({
            description: args.description,
            transport: args.transport,
            enabled: args.enabled,
            command: args.command,
            argsJson: args.argsJson,
            envJson: args.envJson,
            url: args.url,
            headersJson: args.headersJson,
            presetId: args.presetId,
            deletedAt: null,
            updatedAt: args.now,
          })
          .where(eq(projectMcps.id, (existingByName as ProjectMcpRow).id))
          .run()
        const revived = await db
          .select()
          .from(projectMcps)
          .where(eq(projectMcps.id, (existingByName as ProjectMcpRow).id))
          .get()
        if (!revived) throw new Error(`project_mcp revival failed for ${args.name}`)
        return revived as ProjectMcpRow
      }
      await db
        .insert(projectMcps)
        .values({
          id: args.id,
          projectId: args.projectId,
          name: args.name,
          description: args.description,
          transport: args.transport,
          enabled: args.enabled,
          command: args.command,
          argsJson: args.argsJson,
          envJson: args.envJson,
          url: args.url,
          headersJson: args.headersJson,
          presetId: args.presetId,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(projectMcps).where(eq(projectMcps.id, args.id)).get()
      if (!row) throw new Error(`project_mcp ${args.id} not found after insert`)
      return row as ProjectMcpRow
    },

    async patchProjectMcp(args: PatchProjectMcpArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.name !== undefined) updates.name = args.patch.name
      if (args.patch.description !== undefined) updates.description = args.patch.description
      if (args.patch.enabled !== undefined) updates.enabled = args.patch.enabled
      if (args.patch.command !== undefined) updates.command = args.patch.command
      if (args.patch.argsJson !== undefined) updates.argsJson = args.patch.argsJson
      if (args.patch.envJson !== undefined) updates.envJson = args.patch.envJson
      if (args.patch.url !== undefined) updates.url = args.patch.url
      if (args.patch.headersJson !== undefined) updates.headersJson = args.patch.headersJson
      if (args.patch.presetId !== undefined) updates.presetId = args.patch.presetId
      await db.update(projectMcps).set(updates).where(eq(projectMcps.id, args.id)).run()
      const row = await db.select().from(projectMcps).where(eq(projectMcps.id, args.id)).get()
      if (!row) throw new Error(`project_mcp ${args.id} not found after patch`)
      return row as ProjectMcpRow
    },

    async softDeleteProjectMcp(id, now) {
      await db
        .update(projectMcps)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(projectMcps.id, id))
        .run()
    },

    async listInboxItems(filters) {
      const conds = []
      if (filters?.unreadOnly) conds.push(isNull(inboxItems.readAt))
      if (filters?.projectId) conds.push(eq(inboxItems.projectId, filters.projectId))
      const q = db.select().from(inboxItems)
      const rows = await (conds.length > 0 ? q.where(and(...conds)) : q)
        .orderBy(desc(inboxItems.createdAt))
        .all()
      return rows as InboxItemRow[]
    },

    async getInboxItemById(id) {
      const row = await db.select().from(inboxItems).where(eq(inboxItems.id, id)).get()
      return (row ?? null) as InboxItemRow | null
    },

    async createInboxItem(args: CreateInboxItemArgs) {
      await db
        .insert(inboxItems)
        .values({
          id: args.id,
          kind: args.kind,
          title: args.title,
          body: args.body,
          projectId: args.projectId,
          taskId: args.taskId,
          runId: args.runId,
          readAt: null,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(inboxItems).where(eq(inboxItems.id, args.id)).get()
      if (!row) throw new Error(`inbox_item ${args.id} not found after insert`)
      return row as InboxItemRow
    },

    async markInboxItemRead(id, now) {
      await db
        .update(inboxItems)
        .set({ readAt: now, updatedAt: now })
        .where(eq(inboxItems.id, id))
        .run()
    },

    async markAllInboxItemsRead(now, filters) {
      const conds = [isNull(inboxItems.readAt)]
      if (filters?.projectId) conds.push(eq(inboxItems.projectId, filters.projectId))
      await db
        .update(inboxItems)
        .set({ readAt: now, updatedAt: now })
        .where(and(...conds))
        .run()
    },

    async deleteInboxItem(id) {
      await db.delete(inboxItems).where(eq(inboxItems.id, id)).run()
    },

    async countUnreadInboxItems(filters) {
      const conds = [isNull(inboxItems.readAt)]
      if (filters?.projectId) conds.push(eq(inboxItems.projectId, filters.projectId))
      const rows = await db
        .select({ id: inboxItems.id })
        .from(inboxItems)
        .where(and(...conds))
        .all()
      return rows.length
    },

    async listProjectEnvs(projectId, environment) {
      const conds = [eq(projectEnvs.projectId, projectId), isNull(projectEnvs.deletedAt)]
      if (environment) conds.push(eq(projectEnvs.environment, environment))
      return db
        .select()
        .from(projectEnvs)
        .where(and(...conds))
        .orderBy(asc(projectEnvs.environment), asc(projectEnvs.name))
        .all() as ProjectEnvRow[]
    },

    async getProjectEnvById(id) {
      const row = await db
        .select()
        .from(projectEnvs)
        .where(and(eq(projectEnvs.id, id), isNull(projectEnvs.deletedAt)))
        .get()
      return (row ?? null) as ProjectEnvRow | null
    },

    async getProjectEnvByName(projectId, environment: ProjectEnvironment, name) {
      const row = await db
        .select()
        .from(projectEnvs)
        .where(
          and(
            eq(projectEnvs.projectId, projectId),
            eq(projectEnvs.environment, environment),
            eq(projectEnvs.name, name),
            isNull(projectEnvs.deletedAt),
          ),
        )
        .get()
      return (row ?? null) as ProjectEnvRow | null
    },

    async createProjectEnv(args: CreateProjectEnvArgs) {
      await db
        .insert(projectEnvs)
        .values({
          id: args.id,
          projectId: args.projectId,
          environment: args.environment,
          name: args.name,
          value: args.value,
          description: args.description,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(projectEnvs).where(eq(projectEnvs.id, args.id)).get()
      if (!row) throw new Error(`project_env ${args.id} not found after insert`)
      return row as ProjectEnvRow
    },

    async patchProjectEnv(args: PatchProjectEnvArgs) {
      const updates: Record<string, unknown> = { updatedAt: args.now }
      if (args.patch.value !== undefined) updates.value = args.patch.value
      if (args.patch.description !== undefined) updates.description = args.patch.description
      await db.update(projectEnvs).set(updates).where(eq(projectEnvs.id, args.id)).run()
      const row = await db.select().from(projectEnvs).where(eq(projectEnvs.id, args.id)).get()
      if (!row) throw new Error(`project_env ${args.id} not found after patch`)
      return row as ProjectEnvRow
    },

    async softDeleteProjectEnv(id, now) {
      await db
        .update(projectEnvs)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(projectEnvs.id, id))
        .run()
    },

    async getTroubleshootReportById(id) {
      const row = await db
        .select()
        .from(troubleshootReports)
        .where(eq(troubleshootReports.id, id))
        .get()
      return (row ?? null) as TroubleshootReportRow | null
    },

    async listTroubleshootReportsForTask(taskId) {
      return db
        .select()
        .from(troubleshootReports)
        .where(eq(troubleshootReports.taskId, taskId))
        .orderBy(desc(troubleshootReports.createdAt))
        .all() as TroubleshootReportRow[]
    },

    async listTroubleshootReportsByStatus(status: TroubleshootStatus) {
      return db
        .select()
        .from(troubleshootReports)
        .where(eq(troubleshootReports.status, status))
        .orderBy(asc(troubleshootReports.createdAt))
        .all() as TroubleshootReportRow[]
    },

    async createTroubleshootReport(args: CreateTroubleshootReportArgs) {
      await db.insert(troubleshootReports).values({
        id: args.id,
        taskId: args.taskId,
        parentReportId: args.parentReportId,
        status: 'open',
        errorText: args.errorText,
        contextNote: args.contextNote,
        beforeScreenshotPath: args.beforeScreenshotPath,
        createdAt: args.now,
        updatedAt: args.now,
      })
      const row = await db
        .select()
        .from(troubleshootReports)
        .where(eq(troubleshootReports.id, args.id))
        .get()
      return row as TroubleshootReportRow
    },

    async patchTroubleshootReport(args: PatchTroubleshootReportArgs) {
      const patch: Record<string, unknown> = { updatedAt: args.now }
      if (args.status !== undefined) patch.status = args.status
      if (args.afterScreenshotPath !== undefined)
        patch.afterScreenshotPath = args.afterScreenshotPath
      if (args.lastDiagnosisRunId !== undefined) patch.lastDiagnosisRunId = args.lastDiagnosisRunId
      if (args.diagnosisJson !== undefined) patch.diagnosisJson = args.diagnosisJson
      if (args.requiredActionsJson !== undefined)
        patch.requiredActionsJson = args.requiredActionsJson
      if (args.attemptCount !== undefined) patch.attemptCount = args.attemptCount
      if (args.lastTestOutput !== undefined) patch.lastTestOutput = args.lastTestOutput
      if (args.resolvedAt !== undefined) patch.resolvedAt = args.resolvedAt
      await db
        .update(troubleshootReports)
        .set(patch)
        .where(eq(troubleshootReports.id, args.id))
        .run()
      const row = await db
        .select()
        .from(troubleshootReports)
        .where(eq(troubleshootReports.id, args.id))
        .get()
      return row as TroubleshootReportRow
    },

    async listStepAcksForTaskIteration(taskId: string, iterationN: number) {
      return (await db
        .select()
        .from(stepAcks)
        .where(and(eq(stepAcks.taskId, taskId), eq(stepAcks.iterationN, iterationN)))
        .all()) as StepAckRow[]
    },

    async upsertStepAck(args: UpsertStepAckArgs) {
      const existing = await db
        .select()
        .from(stepAcks)
        .where(
          and(
            eq(stepAcks.taskId, args.taskId),
            eq(stepAcks.iterationN, args.iterationN),
            eq(stepAcks.stepId, args.stepId),
          ),
        )
        .get()
      if (existing) {
        await db
          .update(stepAcks)
          .set({
            ack: args.ack,
            ackedByRole: args.ackedByRole,
            notes: args.notes,
            ackedAt: args.now,
            updatedAt: args.now,
          })
          .where(eq(stepAcks.id, (existing as { id: string }).id))
          .run()
        const row = await db
          .select()
          .from(stepAcks)
          .where(eq(stepAcks.id, (existing as { id: string }).id))
          .get()
        return row as StepAckRow
      }
      await db
        .insert(stepAcks)
        .values({
          id: args.id,
          taskId: args.taskId,
          iterationN: args.iterationN,
          stepId: args.stepId,
          ack: args.ack,
          ackedByRole: args.ackedByRole,
          notes: args.notes,
          ackedAt: args.now,
          createdAt: args.now,
          updatedAt: args.now,
        })
        .run()
      const row = await db.select().from(stepAcks).where(eq(stepAcks.id, args.id)).get()
      return row as StepAckRow
    },

    async deleteStepAck(args: { taskId: string; iterationN: number; stepId: string }) {
      await db
        .delete(stepAcks)
        .where(
          and(
            eq(stepAcks.taskId, args.taskId),
            eq(stepAcks.iterationN, args.iterationN),
            eq(stepAcks.stepId, args.stepId),
          ),
        )
        .run()
    },
  }
}
