import {
  ApproveTaskInput,
  CreateClientInput,
  CreateEvidenceInput,
  CreateExpenseInput,
  CreateGateInput,
  CreateKitTemplateInput,
  CreatePersonInput,
  CreateProjectEnvInput,
  CreateProjectInput,
  CreateProjectMcpInput,
  CreateQuoteItemInput,
  CreateQuoteMilestoneInput,
  CreateQuoteModuleInput,
  CreateSecretInput,
  CreateStoryInput,
  CreateTaskInput,
  LogWorkEntryInput,
  PatchClientInput,
  PatchExpenseInput,
  PatchKitTemplateInput,
  PatchPersonInput,
  PatchProjectEnvInput,
  PatchProjectInput,
  PatchProjectMcpInput,
  PatchQuoteInput,
  PatchQuoteItemInput,
  PatchQuoteMilestoneInput,
  PatchQuoteModuleInput,
  PatchSecretInput,
  PatchStoryInput,
  PatchTaskInput,
  ProjectEnvironment,
  RecordGateOutcomeInput,
  RejectTaskInput,
  RequestQuoteChangesInput,
} from '@tortuga-os/contracts'
import type { CoreDeps } from '@tortuga-os/core'
import { useCases } from '@tortuga-os/core'
import { Hono } from 'hono'
import { respond } from './result-to-http'

export function buildDomainRouter(deps: CoreDeps): Hono {
  const r = new Hono()

  r.get('/projects', async (c) => respond(c, await useCases.projects.listProjects(deps)))
  r.post('/projects', async (c) =>
    respond(
      c,
      await useCases.projects.createProject(deps, CreateProjectInput.parse(await c.req.json())),
      201,
    ),
  )
  r.get('/projects/:code', async (c) =>
    respond(c, await useCases.projects.getProjectByCode(deps, c.req.param('code'))),
  )
  r.patch('/projects/:id', async (c) =>
    respond(
      c,
      await useCases.projects.patchProject(
        deps,
        c.req.param('id'),
        PatchProjectInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/projects/:id', async (c) =>
    respond(c, await useCases.projects.deleteProject(deps, c.req.param('id'))),
  )

  r.get('/clients', async (c) => respond(c, await useCases.clients.listClients(deps)))
  r.post('/clients', async (c) =>
    respond(
      c,
      await useCases.clients.createClient(deps, CreateClientInput.parse(await c.req.json())),
      201,
    ),
  )
  r.get('/clients/:id', async (c) =>
    respond(c, await useCases.clients.getClient(deps, c.req.param('id'))),
  )
  r.patch('/clients/:id', async (c) =>
    respond(
      c,
      await useCases.clients.patchClient(
        deps,
        c.req.param('id'),
        PatchClientInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/clients/:id', async (c) =>
    respond(c, await useCases.clients.deleteClient(deps, c.req.param('id'))),
  )

  r.get('/people', async (c) => respond(c, await useCases.people.listPeople(deps)))
  r.post('/people', async (c) =>
    respond(
      c,
      await useCases.people.createPerson(deps, CreatePersonInput.parse(await c.req.json())),
      201,
    ),
  )
  r.get('/people/:id', async (c) =>
    respond(c, await useCases.people.getPerson(deps, c.req.param('id'))),
  )
  r.patch('/people/:id', async (c) =>
    respond(
      c,
      await useCases.people.patchPerson(
        deps,
        c.req.param('id'),
        PatchPersonInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/people/:id', async (c) =>
    respond(c, await useCases.people.deletePerson(deps, c.req.param('id'))),
  )

  r.get('/quotes/project/:code', async (c) =>
    respond(c, await useCases.quotes.listQuotesForProject(deps, c.req.param('code'))),
  )
  r.get('/quotes/project/:code/current', async (c) =>
    respond(c, await useCases.quotes.getCurrentQuote(deps, c.req.param('code'))),
  )
  r.get('/quotes/:id', async (c) =>
    respond(c, await useCases.quotes.getQuote(deps, c.req.param('id'))),
  )
  r.patch('/quotes/:id', async (c) =>
    respond(
      c,
      await useCases.quotes.patchQuote(
        deps,
        c.req.param('id'),
        PatchQuoteInput.parse(await c.req.json()),
      ),
    ),
  )
  r.post('/quotes/:id/send', async (c) =>
    respond(c, await useCases.quotes.sendQuote(deps, c.req.param('id'))),
  )
  r.post('/quotes/:id/approve', async (c) =>
    respond(c, await useCases.quotes.approveQuote(deps, c.req.param('id'))),
  )
  r.post('/quotes/:id/request-changes', async (c) =>
    respond(
      c,
      await useCases.quotes.requestQuoteChanges(
        deps,
        c.req.param('id'),
        RequestQuoteChangesInput.parse(await c.req.json()),
      ),
    ),
  )

  r.get('/stories/project/:code', async (c) =>
    respond(c, await useCases.stories.listStoriesForProject(deps, c.req.param('code'))),
  )
  r.get('/stories/quote/:quoteId', async (c) =>
    respond(c, await useCases.stories.listStoriesForQuote(deps, c.req.param('quoteId'))),
  )
  r.get('/stories/:id', async (c) =>
    respond(c, await useCases.stories.getStory(deps, c.req.param('id'))),
  )
  r.post('/stories', async (c) =>
    respond(
      c,
      await useCases.stories.createStory(deps, CreateStoryInput.parse(await c.req.json())),
      201,
    ),
  )
  r.patch('/stories/:id', async (c) =>
    respond(
      c,
      await useCases.stories.patchStory(
        deps,
        c.req.param('id'),
        PatchStoryInput.parse(await c.req.json()),
      ),
    ),
  )

  r.get('/tasks/story/:storyId', async (c) =>
    respond(c, await useCases.tasks.listTasksForStory(deps, c.req.param('storyId'))),
  )
  r.get('/tasks/:id', async (c) =>
    respond(c, await useCases.tasks.getTask(deps, c.req.param('id'))),
  )
  r.post('/tasks', async (c) =>
    respond(
      c,
      await useCases.tasks.createTask(deps, CreateTaskInput.parse(await c.req.json())),
      201,
    ),
  )
  r.patch('/tasks/:id', async (c) =>
    respond(
      c,
      await useCases.tasks.patchTask(
        deps,
        c.req.param('id'),
        PatchTaskInput.parse(await c.req.json()),
      ),
    ),
  )
  r.post('/tasks/:id/start', async (c) =>
    respond(c, await useCases.tasks.startTask(deps, c.req.param('id'))),
  )
  r.post('/tasks/:id/submit-qa', async (c) =>
    respond(c, await useCases.tasks.submitTaskForQa(deps, c.req.param('id'))),
  )
  r.post('/tasks/:id/approve', async (c) =>
    respond(
      c,
      await useCases.tasks.approveTask(
        deps,
        c.req.param('id'),
        ApproveTaskInput.parse(await c.req.json()),
      ),
    ),
  )
  r.post('/tasks/:id/reject', async (c) =>
    respond(
      c,
      await useCases.tasks.rejectTask(
        deps,
        c.req.param('id'),
        RejectTaskInput.parse(await c.req.json()),
      ),
    ),
  )
  r.get('/tasks/:id/iterations', async (c) =>
    respond(c, await useCases.tasks.listIterationsForTask(deps, c.req.param('id'))),
  )
  r.get('/iterations/:id', async (c) =>
    respond(c, await useCases.tasks.getIteration(deps, c.req.param('id'))),
  )

  r.get('/gates/iteration/:iterationId', async (c) =>
    respond(c, await useCases.gates.listGatesForIteration(deps, c.req.param('iterationId'))),
  )
  r.get('/gates/:id', async (c) =>
    respond(c, await useCases.gates.getGate(deps, c.req.param('id'))),
  )
  r.post('/gates', async (c) =>
    respond(
      c,
      await useCases.gates.createGate(deps, CreateGateInput.parse(await c.req.json())),
      201,
    ),
  )
  r.post('/gates/:id/outcome', async (c) =>
    respond(
      c,
      await useCases.gates.recordGateOutcome(
        deps,
        c.req.param('id'),
        RecordGateOutcomeInput.parse(await c.req.json()),
      ),
    ),
  )

  r.get('/evidence/iteration/:iterationId', async (c) =>
    respond(c, await useCases.evidence.listEvidenceForIteration(deps, c.req.param('iterationId'))),
  )
  r.get('/evidence/:id', async (c) =>
    respond(c, await useCases.evidence.getEvidence(deps, c.req.param('id'))),
  )
  r.post('/evidence', async (c) =>
    respond(
      c,
      await useCases.evidence.createEvidence(deps, CreateEvidenceInput.parse(await c.req.json())),
      201,
    ),
  )

  r.get('/work-entries/task/:taskId', async (c) =>
    respond(c, await useCases.workEntries.listWorkEntriesForTask(deps, c.req.param('taskId'))),
  )
  r.get('/work-entries/iteration/:iterationId', async (c) =>
    respond(
      c,
      await useCases.workEntries.listWorkEntriesForIteration(deps, c.req.param('iterationId')),
    ),
  )
  r.get('/work-entries/task/:taskId/total', async (c) =>
    respond(c, await useCases.workEntries.getTaskTotalMinutes(deps, c.req.param('taskId'))),
  )
  r.post('/work-entries', async (c) =>
    respond(
      c,
      await useCases.workEntries.logWorkEntry(deps, LogWorkEntryInput.parse(await c.req.json())),
      201,
    ),
  )

  r.get('/reports/project/:code/cost', async (c) =>
    respond(c, await useCases.reports.getProjectCostReport(deps, c.req.param('code'))),
  )

  // POST /api/agent-runs lives in the sidecar (it needs workspace + prompt
  // assembly). Here we expose read-only GETs.
  r.get('/agent-runs/task/:taskId', async (c) =>
    respond(c, await useCases.agentRuns.listAgentRunsForTask(deps, c.req.param('taskId'))),
  )
  r.get('/agent-runs/:id', async (c) =>
    respond(c, await useCases.agentRuns.getAgentRun(deps, c.req.param('id'))),
  )

  r.get('/quotes/project/:code/modules', async (c) =>
    respond(c, await useCases.quotes.listQuoteModulesForProject(deps, c.req.param('code'))),
  )
  r.post('/quote-modules', async (c) =>
    respond(
      c,
      await useCases.quotes.createQuoteModule(
        deps,
        CreateQuoteModuleInput.parse(await c.req.json()),
      ),
      201,
    ),
  )
  r.patch('/quote-modules/:id', async (c) =>
    respond(
      c,
      await useCases.quotes.patchQuoteModule(
        deps,
        c.req.param('id'),
        PatchQuoteModuleInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/quote-modules/:id', async (c) =>
    respond(c, await useCases.quotes.deleteQuoteModule(deps, c.req.param('id'))),
  )

  r.get('/quotes/:quoteId/items', async (c) =>
    respond(c, await useCases.quotes.listQuoteItems(deps, c.req.param('quoteId'))),
  )
  r.post('/quote-items', async (c) =>
    respond(
      c,
      await useCases.quotes.createQuoteItem(deps, CreateQuoteItemInput.parse(await c.req.json())),
      201,
    ),
  )
  r.patch('/quote-items/:id', async (c) =>
    respond(
      c,
      await useCases.quotes.patchQuoteItem(
        deps,
        c.req.param('id'),
        PatchQuoteItemInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/quote-items/:id', async (c) =>
    respond(c, await useCases.quotes.deleteQuoteItem(deps, c.req.param('id'))),
  )

  r.get('/quotes/:quoteId/milestones', async (c) =>
    respond(c, await useCases.quotes.listQuoteMilestones(deps, c.req.param('quoteId'))),
  )
  r.post('/quote-milestones', async (c) =>
    respond(
      c,
      await useCases.quotes.createQuoteMilestone(
        deps,
        CreateQuoteMilestoneInput.parse(await c.req.json()),
      ),
      201,
    ),
  )
  r.patch('/quote-milestones/:id', async (c) =>
    respond(
      c,
      await useCases.quotes.patchQuoteMilestone(
        deps,
        c.req.param('id'),
        PatchQuoteMilestoneInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/quote-milestones/:id', async (c) =>
    respond(c, await useCases.quotes.deleteQuoteMilestone(deps, c.req.param('id'))),
  )

  r.get('/projects/:projectCode/mcps', async (c) =>
    respond(c, await useCases.projectMcps.listProjectMcps(deps, c.req.param('projectCode'))),
  )
  r.get('/project-mcps/:id', async (c) =>
    respond(c, await useCases.projectMcps.getProjectMcp(deps, c.req.param('id'))),
  )
  r.post('/projects/:projectCode/mcps', async (c) =>
    respond(
      c,
      await useCases.projectMcps.createProjectMcp(
        deps,
        c.req.param('projectCode'),
        CreateProjectMcpInput.parse(await c.req.json()),
      ),
      201,
    ),
  )
  r.patch('/project-mcps/:id', async (c) =>
    respond(
      c,
      await useCases.projectMcps.patchProjectMcp(
        deps,
        c.req.param('id'),
        PatchProjectMcpInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/project-mcps/:id', async (c) =>
    respond(c, await useCases.projectMcps.deleteProjectMcp(deps, c.req.param('id'))),
  )

  r.get('/kit-templates', async (c) =>
    respond(c, await useCases.kitTemplates.listKitTemplates(deps)),
  )
  r.get('/kit-templates/:id', async (c) =>
    respond(c, await useCases.kitTemplates.getKitTemplate(deps, c.req.param('id'))),
  )
  r.post('/kit-templates', async (c) =>
    respond(
      c,
      await useCases.kitTemplates.createKitTemplate(
        deps,
        CreateKitTemplateInput.parse(await c.req.json()),
      ),
      201,
    ),
  )
  r.patch('/kit-templates/:id', async (c) =>
    respond(
      c,
      await useCases.kitTemplates.patchKitTemplate(
        deps,
        c.req.param('id'),
        PatchKitTemplateInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/kit-templates/:id', async (c) =>
    respond(c, await useCases.kitTemplates.deleteKitTemplate(deps, c.req.param('id'))),
  )

  r.get('/expenses/project/:code', async (c) =>
    respond(c, await useCases.expenses.listExpensesForProject(deps, c.req.param('code'))),
  )
  r.get('/expenses/project/:code/margin', async (c) =>
    respond(c, await useCases.expenses.getProjectMargin(deps, c.req.param('code'))),
  )
  r.post('/expenses', async (c) =>
    respond(
      c,
      await useCases.expenses.createExpense(deps, CreateExpenseInput.parse(await c.req.json())),
      201,
    ),
  )
  r.patch('/expenses/:id', async (c) =>
    respond(
      c,
      await useCases.expenses.patchExpense(
        deps,
        c.req.param('id'),
        PatchExpenseInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/expenses/:id', async (c) =>
    respond(c, await useCases.expenses.deleteExpense(deps, c.req.param('id'))),
  )

  // ── secrets (per-project encrypted credentials) ─────────────────────
  r.get('/secrets/project/:code', async (c) =>
    respond(c, await useCases.secrets.listSecretsForProject(deps, c.req.param('code'))),
  )
  r.post('/secrets', async (c) =>
    respond(
      c,
      await useCases.secrets.createSecret(deps, CreateSecretInput.parse(await c.req.json())),
      201,
    ),
  )
  r.patch('/secrets/:id', async (c) =>
    respond(
      c,
      await useCases.secrets.patchSecret(
        deps,
        c.req.param('id'),
        PatchSecretInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/secrets/:id', async (c) =>
    respond(c, await useCases.secrets.deleteSecret(deps, c.req.param('id'))),
  )
  r.post('/secrets/:id/reveal', async (c) =>
    respond(c, await useCases.secrets.revealSecret(deps, c.req.param('id'))),
  )

  r.get('/inbox', async (c) => {
    const unreadOnly = c.req.query('unreadOnly') === 'true' || c.req.query('unreadOnly') === '1'
    const projectId = c.req.query('projectId')
    const filters: { unreadOnly?: boolean; projectId?: string } = {}
    if (unreadOnly) filters.unreadOnly = true
    if (projectId) filters.projectId = projectId
    return respond(c, await useCases.inbox.listInboxItems(deps, filters))
  })
  r.get('/inbox/unread-count', async (c) => {
    const projectId = c.req.query('projectId')
    const filters: { projectId?: string } = {}
    if (projectId) filters.projectId = projectId
    return respond(c, await useCases.inbox.countUnread(deps, filters))
  })
  r.post('/inbox/:id/read', async (c) =>
    respond(c, await useCases.inbox.markRead(deps, c.req.param('id'))),
  )
  r.post('/inbox/mark-all-read', async (c) => {
    const projectId = c.req.query('projectId')
    const filters: { projectId?: string } = {}
    if (projectId) filters.projectId = projectId
    return respond(c, await useCases.inbox.markAllRead(deps, filters))
  })
  r.delete('/inbox/:id', async (c) =>
    respond(c, await useCases.inbox.dismissItem(deps, c.req.param('id'))),
  )

  // ── project envs (non-secret env vars per env) ──────────────────────
  r.get('/projects/:projectCode/envs', async (c) => {
    const envParam = c.req.query('environment')
    const environment = envParam ? ProjectEnvironment.parse(envParam) : undefined
    return respond(
      c,
      await useCases.projectEnvs.listProjectEnvs(deps, c.req.param('projectCode'), environment),
    )
  })
  r.post('/projects/:projectCode/envs', async (c) =>
    respond(
      c,
      await useCases.projectEnvs.createProjectEnv(
        deps,
        c.req.param('projectCode'),
        CreateProjectEnvInput.parse(await c.req.json()),
      ),
      201,
    ),
  )
  r.patch('/project-envs/:id', async (c) =>
    respond(
      c,
      await useCases.projectEnvs.patchProjectEnv(
        deps,
        c.req.param('id'),
        PatchProjectEnvInput.parse(await c.req.json()),
      ),
    ),
  )
  r.delete('/project-envs/:id', async (c) =>
    respond(c, await useCases.projectEnvs.deleteProjectEnv(deps, c.req.param('id'))),
  )

  r.get('/trash/clients', async (c) => respond(c, await useCases.trash.listTrashedClients(deps)))
  r.post('/trash/clients/:id/restore', async (c) =>
    respond(c, await useCases.trash.restoreClient(deps, c.req.param('id'))),
  )
  r.get('/trash/people', async (c) => respond(c, await useCases.trash.listTrashedPeople(deps)))
  r.post('/trash/people/:id/restore', async (c) =>
    respond(c, await useCases.trash.restorePerson(deps, c.req.param('id'))),
  )
  r.get('/trash/projects', async (c) => respond(c, await useCases.trash.listTrashedProjects(deps)))
  r.post('/trash/projects/:id/restore', async (c) =>
    respond(c, await useCases.trash.restoreProject(deps, c.req.param('id'))),
  )

  return r
}
