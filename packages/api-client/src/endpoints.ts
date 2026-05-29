import type {
  AgentRunDTO,
  ApproveTaskInput,
  ClientDTO,
  ConfirmTroubleshootInput,
  CreateAgentRunInput,
  CreateBugfixInput,
  CreateBugfixOutput,
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
  CreateTroubleshootInput,
  DiscoveryConversationWithMessagesDTO,
  DiscoveryMessageDTO,
  DiscoveryStoryDraftDTO,
  EvidenceDTO,
  ExpenseDTO,
  GateDTO,
  GateType,
  InboxItemDTO,
  InstantiateKitResult,
  IterationDTO,
  KitTemplateDTO,
  LogWorkEntryInput,
  MarkActionDoneInput,
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
  PersonDTO,
  ProjectCostReportDTO,
  ProjectDTO,
  ProjectEnvDTO,
  ProjectEnvironment,
  ProjectMarginDTO,
  ProjectMcpDTO,
  ProjectWithClientDTO,
  QaVerdictResponseDTO,
  QuoteDTO,
  QuoteItemDTO,
  QuoteMilestoneDTO,
  QuoteModuleDTO,
  RecordGateOutcomeInput,
  RejectTaskInput,
  ReopenTaskInput,
  RequestQuoteChangesInput,
  RunGatesResultDTO,
  SecretDTO,
  StepAckDTO,
  StoryDTO,
  TaskDTO,
  TroubleshootReportDTO,
  UpsertStepAckInput,
  WorkEntryDTO,
  WorkspaceFileDTO,
  WorkspaceTreeDTO,
} from '@tortuga-os/contracts'
import { request } from './http'
import { streamSSE } from './stream'
import type { ApiClientConfig } from './types'

export function createApiClient(config: ApiClientConfig) {
  return {
    projects: {
      list: () => request<ProjectWithClientDTO[]>(config, 'GET', '/api/projects'),
      create: (input: CreateProjectInput) =>
        request<ProjectDTO>(config, 'POST', '/api/projects', input),
      getByCode: (code: string) =>
        request<ProjectWithClientDTO>(config, 'GET', `/api/projects/${encodeURIComponent(code)}`),
      patch: (id: string, input: PatchProjectInput) =>
        request<ProjectDTO>(config, 'PATCH', `/api/projects/${id}`, input),
      delete: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/projects/${id}`),
    },

    clients: {
      list: () => request<ClientDTO[]>(config, 'GET', '/api/clients'),
      create: (input: CreateClientInput) =>
        request<ClientDTO>(config, 'POST', '/api/clients', input),
      get: (id: string) => request<ClientDTO>(config, 'GET', `/api/clients/${id}`),
      patch: (id: string, input: PatchClientInput) =>
        request<ClientDTO>(config, 'PATCH', `/api/clients/${id}`, input),
      delete: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/clients/${id}`),
    },

    people: {
      list: () => request<PersonDTO[]>(config, 'GET', '/api/people'),
      create: (input: CreatePersonInput) =>
        request<PersonDTO>(config, 'POST', '/api/people', input),
      get: (id: string) => request<PersonDTO>(config, 'GET', `/api/people/${id}`),
      patch: (id: string, input: PatchPersonInput) =>
        request<PersonDTO>(config, 'PATCH', `/api/people/${id}`, input),
      delete: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/people/${id}`),
    },

    quotes: {
      listForProject: (code: string) =>
        request<QuoteDTO[]>(config, 'GET', `/api/quotes/project/${encodeURIComponent(code)}`),
      getCurrent: (code: string) =>
        request<QuoteDTO>(config, 'GET', `/api/quotes/project/${encodeURIComponent(code)}/current`),
      get: (id: string) => request<QuoteDTO>(config, 'GET', `/api/quotes/${id}`),
      patch: (id: string, input: PatchQuoteInput) =>
        request<QuoteDTO>(config, 'PATCH', `/api/quotes/${id}`, input),
      send: (id: string) => request<QuoteDTO>(config, 'POST', `/api/quotes/${id}/send`),
      approve: (id: string) => request<QuoteDTO>(config, 'POST', `/api/quotes/${id}/approve`),
      requestChanges: (id: string, input: RequestQuoteChangesInput) =>
        request<QuoteDTO>(config, 'POST', `/api/quotes/${id}/request-changes`, input),
    },

    stories: {
      listForProject: (code: string) =>
        request<StoryDTO[]>(config, 'GET', `/api/stories/project/${encodeURIComponent(code)}`),
      listForQuote: (quoteId: string) =>
        request<StoryDTO[]>(config, 'GET', `/api/stories/quote/${quoteId}`),
      get: (id: string) => request<StoryDTO>(config, 'GET', `/api/stories/${id}`),
      create: (input: CreateStoryInput) => request<StoryDTO>(config, 'POST', '/api/stories', input),
      patch: (id: string, input: PatchStoryInput) =>
        request<StoryDTO>(config, 'PATCH', `/api/stories/${id}`, input),
    },

    tasks: {
      listForStory: (storyId: string) =>
        request<TaskDTO[]>(config, 'GET', `/api/tasks/story/${storyId}`),
      get: (id: string) => request<TaskDTO>(config, 'GET', `/api/tasks/${id}`),
      create: (input: CreateTaskInput) => request<TaskDTO>(config, 'POST', '/api/tasks', input),
      patch: (id: string, input: PatchTaskInput) =>
        request<TaskDTO>(config, 'PATCH', `/api/tasks/${id}`, input),
      start: (id: string) => request<TaskDTO>(config, 'POST', `/api/tasks/${id}/start`),
      submitQa: (id: string) => request<TaskDTO>(config, 'POST', `/api/tasks/${id}/submit-qa`),
      approve: (id: string, input: ApproveTaskInput) =>
        request<TaskDTO>(config, 'POST', `/api/tasks/${id}/approve`, input),
      reject: (id: string, input: RejectTaskInput) =>
        request<TaskDTO>(config, 'POST', `/api/tasks/${id}/reject`, input),
      reopen: (id: string, input: ReopenTaskInput) =>
        request<TaskDTO>(config, 'POST', `/api/tasks/${id}/reopen`, input),
      listStepAcks: (id: string) =>
        request<StepAckDTO[]>(config, 'GET', `/api/tasks/${id}/step-acks`),
      upsertStepAck: (id: string, input: UpsertStepAckInput) =>
        request<StepAckDTO>(config, 'POST', `/api/tasks/${id}/step-acks`, input),
      deleteStepAck: (id: string, stepId: string) =>
        request<{ ok: true }>(
          config,
          'DELETE',
          `/api/tasks/${id}/step-acks/${encodeURIComponent(stepId)}`,
        ),
      listIterations: (id: string) =>
        request<IterationDTO[]>(config, 'GET', `/api/tasks/${id}/iterations`),
      getIteration: (id: string) => request<IterationDTO>(config, 'GET', `/api/iterations/${id}`),
    },

    gates: {
      listForIteration: (iterationId: string) =>
        request<GateDTO[]>(config, 'GET', `/api/gates/iteration/${iterationId}`),
      get: (id: string) => request<GateDTO>(config, 'GET', `/api/gates/${id}`),
      create: (input: CreateGateInput) => request<GateDTO>(config, 'POST', '/api/gates', input),
      recordOutcome: (id: string, input: RecordGateOutcomeInput) =>
        request<GateDTO>(config, 'POST', `/api/gates/${id}/outcome`, input),
      runForTask: (
        taskId: string,
        input: {
          stack?: 'flutter' | 'nextjs' | 'vite-react' | 'angular' | 'astro' | 'node'
          gates?: GateType[]
        },
      ) => request<RunGatesResultDTO>(config, 'POST', `/api/gates/run/${taskId}`, input),
      cleanForTask: (
        taskId: string,
        input: {
          stack?: 'flutter' | 'nextjs' | 'vite-react' | 'angular' | 'astro' | 'node'
        },
      ) =>
        request<{
          taskId: string
          stack: string
          command: string
          exitCode: number
          durationMs: number
          output: string
        }>(config, 'POST', `/api/gates/clean/${taskId}`, input),
      tailLog: (taskId: string, gate: GateType, offset: number) =>
        request<{ offset: number; size: number; chunk: string; done: boolean }>(
          config,
          'GET',
          `/api/gates/log/${taskId}?gate=${encodeURIComponent(gate)}&offset=${offset}`,
        ),
      reset: (taskId: string, types: GateType[]) =>
        request<{ deleted: number }>(config, 'POST', `/api/gates/reset/${taskId}`, { types }),
      repair: (taskId: string, input: { gateType: GateType; gateLabel: string; log: string }) =>
        request<AgentRunDTO>(config, 'POST', `/api/gates/repair/${taskId}`, input),
      preview: (stack: string, gates?: GateType[]) =>
        request<{
          stack: string
          gates: Array<
            | { type: GateType; cmd: string; args: string[]; supported: true }
            | { type: GateType; cmd: null; args: []; supported: false }
          >
        }>(
          config,
          'GET',
          `/api/gates/preview?stack=${encodeURIComponent(stack)}${
            gates && gates.length > 0 ? `&gates=${gates.join(',')}` : ''
          }`,
        ),
    },

    evidence: {
      listForIteration: (iterationId: string) =>
        request<EvidenceDTO[]>(config, 'GET', `/api/evidence/iteration/${iterationId}`),
      get: (id: string) => request<EvidenceDTO>(config, 'GET', `/api/evidence/${id}`),
      create: (input: CreateEvidenceInput) =>
        request<EvidenceDTO>(config, 'POST', '/api/evidence', input),
    },

    workEntries: {
      listForTask: (taskId: string) =>
        request<WorkEntryDTO[]>(config, 'GET', `/api/work-entries/task/${taskId}`),
      listForIteration: (iterationId: string) =>
        request<WorkEntryDTO[]>(config, 'GET', `/api/work-entries/iteration/${iterationId}`),
      totalForTask: (taskId: string) =>
        request<{ taskId: string; totalMinutes: number }>(
          config,
          'GET',
          `/api/work-entries/task/${taskId}/total`,
        ),
      log: (input: LogWorkEntryInput) =>
        request<WorkEntryDTO>(config, 'POST', '/api/work-entries', input),
    },

    reports: {
      projectCost: (code: string) =>
        request<ProjectCostReportDTO>(
          config,
          'GET',
          `/api/reports/project/${encodeURIComponent(code)}/cost`,
        ),
    },

    discovery: {
      getOrStart: (projectCode: string, provider: 'anthropic-sdk' | 'claude-cli' = 'claude-cli') =>
        request<DiscoveryConversationWithMessagesDTO>(
          config,
          'GET',
          `/api/discovery/projects/${encodeURIComponent(projectCode)}/conversation?provider=${provider}`,
        ),
      load: (conversationId: string) =>
        request<DiscoveryConversationWithMessagesDTO>(
          config,
          'GET',
          `/api/discovery/conversations/${conversationId}`,
        ),
      sendMessage: (conversationId: string, content: string) =>
        request<{
          userMessage: DiscoveryMessageDTO
          agentMessage: DiscoveryMessageDTO
          storiesDraft: DiscoveryStoryDraftDTO[] | null
        }>(config, 'POST', `/api/discovery/conversations/${conversationId}/messages`, {
          content,
        }),
      streamMessage: (
        conversationId: string,
        content: string,
        callbacks: {
          onUserSaved?: (m: DiscoveryMessageDTO) => void
          onDelta?: (text: string) => void
          onDone?: (
            agentMessage: DiscoveryMessageDTO,
            storiesDraft: DiscoveryStoryDraftDTO[] | null,
          ) => void
          onError?: (message: string) => void
        },
        signal?: AbortSignal,
      ) =>
        streamSSE<
          | { type: 'user-saved'; message: DiscoveryMessageDTO }
          | { type: 'delta'; text: string }
          | {
              type: 'done'
              agentMessage: DiscoveryMessageDTO
              storiesDraft: DiscoveryStoryDraftDTO[] | null
            }
          | { type: 'error'; message: string }
        >(
          config,
          `/api/discovery/conversations/${conversationId}/messages/stream`,
          { content },
          (ev) => {
            if (ev.type === 'user-saved') callbacks.onUserSaved?.(ev.message)
            else if (ev.type === 'delta') callbacks.onDelta?.(ev.text)
            else if (ev.type === 'done') callbacks.onDone?.(ev.agentMessage, ev.storiesDraft)
            else if (ev.type === 'error') callbacks.onError?.(ev.message)
          },
          signal,
        ),
      approve: (conversationId: string) =>
        request<{ conversationId: string; storyIds: string[]; taskIds: string[] }>(
          config,
          'POST',
          `/api/discovery/conversations/${conversationId}/approve`,
        ),
    },

    scaffold: {
      listTemplates: () =>
        request<{
          templates: Array<{ stack: string; displayName: string; description: string }>
        }>(config, 'GET', '/api/scaffold/templates'),
      preview: (projectCode: string, stack: string) =>
        request<{
          stack: string
          displayName: string
          description: string
          workspace: string
          steps: Array<{ id: string; label: string; cmd: string }>
          files: Array<{ to: string }>
          verify: Array<{ id: string; label: string; cmd: string }>
        }>(config, 'POST', '/api/scaffold/preview', { projectCode, stack }),
      history: (projectCode: string) =>
        request<{
          version: 1
          runs: Array<{
            id: string
            stack: string
            startedAt: number
            finishedAt: number | null
            steps: Array<{
              id: string
              label: string
              status: 'pending' | 'running' | 'done' | 'failed'
              log: string
              exitCode: number | null
            }>
            createdFiles: string[]
            outcome: 'succeeded' | 'failed'
            error: string | null
          }>
        }>(config, 'GET', `/api/scaffold/history/${encodeURIComponent(projectCode)}`),
      run: (
        projectCode: string,
        stack: string,
        callbacks: {
          onStepStart?: (stepId: string, label: string) => void
          onStepOutput?: (stepId: string, text: string, isStderr: boolean) => void
          onStepEnd?: (stepId: string, exitCode: number) => void
          onFile?: (to: string) => void
          onDone?: () => void
          onError?: (stepId: string | null, message: string) => void
        },
        signal?: AbortSignal,
      ) =>
        streamSSE<
          | { type: 'step-start'; stepId: string; label: string }
          | { type: 'step-stdout' | 'step-stderr'; stepId: string; text: string }
          | { type: 'step-end'; stepId: string; exitCode: number }
          | { type: 'file'; to: string }
          | { type: 'done' }
          | { type: 'error'; stepId?: string; message: string }
        >(
          config,
          '/api/scaffold/run',
          { projectCode, stack },
          (ev) => {
            // eslint-disable-next-line no-console
            console.log('[scaffold-sse]', ev.type, ev)
            switch (ev.type) {
              case 'step-start':
                callbacks.onStepStart?.(ev.stepId, ev.label)
                return
              case 'step-stdout':
                callbacks.onStepOutput?.(ev.stepId, ev.text, false)
                return
              case 'step-stderr':
                callbacks.onStepOutput?.(ev.stepId, ev.text, true)
                return
              case 'step-end':
                callbacks.onStepEnd?.(ev.stepId, ev.exitCode)
                return
              case 'file':
                callbacks.onFile?.(ev.to)
                return
              case 'done':
                callbacks.onDone?.()
                return
              case 'error':
                callbacks.onError?.(ev.stepId ?? null, ev.message)
                return
            }
          },
          signal,
        ),
      repair: (input: {
        projectCode: string
        taskId: string
        stack: string
        failedSteps: Array<{ id: string; label: string; log: string }>
      }) => request<AgentRunDTO>(config, 'POST', '/api/scaffold/repair', input),
    },

    preview: {
      // Sidecar returns the raw AVD names as strings (e.g. "Pixel_8_Pro_API_36").
      listAvds: () => request<{ avds: string[] }>(config, 'GET', '/api/preview/avds'),
      emulatorStatus: () =>
        request<{
          emulators: Array<{ avd: string; serial: string | null; state: string }>
        }>(config, 'GET', '/api/preview/emulator/status'),
      emulatorLog: (avd: string) =>
        request<{
          avd: string
          state: 'booting' | 'ready' | 'stopped'
          serial: string | null
          startedAt: number
          lines: string[]
        }>(config, 'GET', `/api/preview/emulator/log?avd=${encodeURIComponent(avd)}`),
      bootEmulator: (avd: string) =>
        request<{ avd: string; serial: string | null; state: string }>(
          config,
          'POST',
          '/api/preview/emulator/boot',
          { avd },
        ),
      killEmulator: (avd: string) =>
        request<{ avd: string; state: string }>(config, 'POST', '/api/preview/emulator/kill', {
          avd,
        }),
      listDevices: () =>
        request<{
          devices: Array<{ serial: string; state: string; label: string }>
        }>(config, 'GET', '/api/preview/devices'),
      /** Returns the URL of the live screenshot stream — the consumer
       *  uses it as the `src` of an <img> with a cache-busting query.
       *  When a handshake secret is configured (Tauri runtime), it is
       *  passed via `_secret` query param because <img> cannot set
       *  custom HTTP headers. */
      screenshotUrl: (serial: string) => {
        const base = `${config.baseUrl}/api/preview/devices/${encodeURIComponent(serial)}/screenshot`
        if (!config.secret) return base
        return `${base}?_secret=${encodeURIComponent(config.secret)}`
      },
      /** Returns the WebSocket URL for the interactive scrcpy H.264 stream.
       *  Same handshake semantics as screenshotUrl (token in `_secret`
       *  query because WebSocket can't set custom headers from the
       *  browser). The protocol scheme is `ws://` (or `wss://` if the
       *  base URL is https). */
      streamWsUrl: (serial: string) => {
        const httpBase = `${config.baseUrl}/api/preview/devices/${encodeURIComponent(serial)}/stream`
        const wsBase = httpBase.replace(/^http/, 'ws')
        if (!config.secret) return wsBase
        return `${wsBase}?_secret=${encodeURIComponent(config.secret)}`
      },
      launchApp: (projectCode: string, serial: string) =>
        request<{ projectCode: string; serial: string; state: string }>(
          config,
          'POST',
          '/api/preview/app/launch',
          { projectCode, serial },
        ),
      stopApp: (serial: string) =>
        request<{ serial: string; state: string }>(config, 'POST', '/api/preview/app/stop', {
          serial,
        }),
      appStatus: () =>
        request<{
          launches: Array<{ projectCode: string; serial: string; state: string }>
        }>(config, 'GET', '/api/preview/app/status'),
      appLog: (serial: string) =>
        request<{
          serial: string
          projectCode: string
          running: boolean
          startedAt: number
          lines: string[]
        }>(config, 'GET', `/api/preview/app/log?serial=${encodeURIComponent(serial)}`),
    },

    workspace: {
      getTree: (projectCode: string) =>
        request<WorkspaceTreeDTO>(
          config,
          'GET',
          `/api/workspace/${encodeURIComponent(projectCode)}`,
        ),
      readFile: (projectCode: string, path: string) =>
        request<WorkspaceFileDTO>(
          config,
          'GET',
          `/api/workspace/${encodeURIComponent(projectCode)}/file?path=${encodeURIComponent(path)}`,
        ),
      ensure: (projectCode: string) =>
        request<{ projectCode: string; root: string }>(
          config,
          'POST',
          `/api/workspace/${encodeURIComponent(projectCode)}/ensure`,
        ),
    },

    agentRuns: {
      listForTask: (taskId: string) =>
        request<AgentRunDTO[]>(config, 'GET', `/api/agent-runs/task/${taskId}`),
      get: (id: string) => request<AgentRunDTO>(config, 'GET', `/api/agent-runs/${id}`),
      create: (input: CreateAgentRunInput) =>
        request<AgentRunDTO>(config, 'POST', '/api/agent-runs', input),
      cancel: (id: string) => request<AgentRunDTO>(config, 'POST', `/api/agent-runs/${id}/cancel`),
      qaVerdict: (id: string) =>
        request<QaVerdictResponseDTO>(config, 'GET', `/api/agent-runs/${id}/qa-verdict`),
    },

    troubleshoot: {
      listForTask: (taskId: string) =>
        request<TroubleshootReportDTO[]>(config, 'GET', `/api/troubleshoot/by-task/${taskId}`),
      get: (id: string) => request<TroubleshootReportDTO>(config, 'GET', `/api/troubleshoot/${id}`),
      create: (input: CreateTroubleshootInput) =>
        request<TroubleshootReportDTO>(config, 'POST', '/api/troubleshoot', input),
      createBugfix: (input: CreateBugfixInput) =>
        request<CreateBugfixOutput>(config, 'POST', '/api/troubleshoot/bugfix', input),
      rediagnose: (id: string) =>
        request<{ reportId: string; runId: string | null; status: string }>(
          config,
          'POST',
          `/api/troubleshoot/${id}/rediagnose`,
        ),
      apply: (id: string) =>
        request<{
          outcome: {
            reportId: string
            status:
              | 'applied-files'
              | 'applied-files-and-sql'
              | 'applied-files-sql-failed'
              | 'verified'
              | 'test-failed-retrying'
              | 'test-failed-escalated'
              | 'no-changes'
              | 'invalid-state'
              | 'no-diagnosis'
              | 'unsafe-path'
              | 'mcp-unavailable'
            filesWritten: string[]
            sqlResults?: Array<{ name: string; ok: boolean; detail: string }>
            testResult?: {
              passed: boolean
              exitCode: number | null
              testRelPath: string
              outputTail: string
              nextStatus: 'verified' | 'open' | 'escalated'
            }
            reason?: string
          }
          report: TroubleshootReportDTO | null
        }>(config, 'POST', `/api/troubleshoot/${id}/apply`),
      markActionDone: (id: string, input: MarkActionDoneInput) =>
        request<TroubleshootReportDTO>(
          config,
          'POST',
          `/api/troubleshoot/${id}/action-completed`,
          input,
        ),
      confirm: (id: string, input: ConfirmTroubleshootInput) =>
        request<TroubleshootReportDTO>(config, 'POST', `/api/troubleshoot/${id}/confirm`, input),
      dismiss: (id: string) =>
        request<TroubleshootReportDTO>(config, 'POST', `/api/troubleshoot/${id}/dismiss`),
    },

    quoteModules: {
      listForProject: (projectCode: string) =>
        request<QuoteModuleDTO[]>(
          config,
          'GET',
          `/api/quotes/project/${encodeURIComponent(projectCode)}/modules`,
        ),
      create: (input: CreateQuoteModuleInput) =>
        request<QuoteModuleDTO>(config, 'POST', '/api/quote-modules', input),
      patch: (id: string, input: PatchQuoteModuleInput) =>
        request<QuoteModuleDTO>(config, 'PATCH', `/api/quote-modules/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/quote-modules/${id}`),
    },

    quoteItems: {
      listForQuote: (quoteId: string) =>
        request<QuoteItemDTO[]>(config, 'GET', `/api/quotes/${encodeURIComponent(quoteId)}/items`),
      create: (input: CreateQuoteItemInput) =>
        request<QuoteItemDTO>(config, 'POST', '/api/quote-items', input),
      patch: (id: string, input: PatchQuoteItemInput) =>
        request<QuoteItemDTO>(config, 'PATCH', `/api/quote-items/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/quote-items/${id}`),
    },

    quoteMilestones: {
      listForQuote: (quoteId: string) =>
        request<QuoteMilestoneDTO[]>(
          config,
          'GET',
          `/api/quotes/${encodeURIComponent(quoteId)}/milestones`,
        ),
      create: (input: CreateQuoteMilestoneInput) =>
        request<QuoteMilestoneDTO>(config, 'POST', '/api/quote-milestones', input),
      patch: (id: string, input: PatchQuoteMilestoneInput) =>
        request<QuoteMilestoneDTO>(config, 'PATCH', `/api/quote-milestones/${id}`, input),
      remove: (id: string) =>
        request<{ ok: true }>(config, 'DELETE', `/api/quote-milestones/${id}`),
    },

    kitTemplates: {
      list: () => request<KitTemplateDTO[]>(config, 'GET', '/api/kit-templates'),
      get: (id: string) => request<KitTemplateDTO>(config, 'GET', `/api/kit-templates/${id}`),
      create: (input: CreateKitTemplateInput) =>
        request<KitTemplateDTO>(config, 'POST', '/api/kit-templates', input),
      patch: (id: string, input: PatchKitTemplateInput) =>
        request<KitTemplateDTO>(config, 'PATCH', `/api/kit-templates/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/kit-templates/${id}`),
      instantiate: (id: string, projectCode: string) =>
        request<InstantiateKitResult>(config, 'POST', `/api/kit-templates/${id}/instantiate`, {
          projectCode,
        }),
    },

    expenses: {
      listForProject: (projectCode: string) =>
        request<ExpenseDTO[]>(
          config,
          'GET',
          `/api/expenses/project/${encodeURIComponent(projectCode)}`,
        ),
      getMargin: (projectCode: string) =>
        request<ProjectMarginDTO>(
          config,
          'GET',
          `/api/expenses/project/${encodeURIComponent(projectCode)}/margin`,
        ),
      create: (input: CreateExpenseInput) =>
        request<ExpenseDTO>(config, 'POST', '/api/expenses', input),
      patch: (id: string, input: PatchExpenseInput) =>
        request<ExpenseDTO>(config, 'PATCH', `/api/expenses/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/expenses/${id}`),
    },

    secrets: {
      listForProject: (projectCode: string) =>
        request<SecretDTO[]>(
          config,
          'GET',
          `/api/secrets/project/${encodeURIComponent(projectCode)}`,
        ),
      create: (input: CreateSecretInput) =>
        request<SecretDTO>(config, 'POST', '/api/secrets', input),
      patch: (id: string, input: PatchSecretInput) =>
        request<SecretDTO>(config, 'PATCH', `/api/secrets/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/secrets/${id}`),
      reveal: (id: string) =>
        request<{ id: string; name: string; value: string }>(
          config,
          'POST',
          `/api/secrets/${id}/reveal`,
        ),
    },

    trash: {
      listClients: () => request<ClientDTO[]>(config, 'GET', '/api/trash/clients'),
      restoreClient: (id: string) =>
        request<ClientDTO>(config, 'POST', `/api/trash/clients/${id}/restore`),
      listPeople: () => request<PersonDTO[]>(config, 'GET', '/api/trash/people'),
      restorePerson: (id: string) =>
        request<PersonDTO>(config, 'POST', `/api/trash/people/${id}/restore`),
      listProjects: () => request<ProjectWithClientDTO[]>(config, 'GET', '/api/trash/projects'),
      restoreProject: (id: string) =>
        request<{ ok: true }>(config, 'POST', `/api/trash/projects/${id}/restore`),
    },

    projectMcps: {
      listForProject: (projectCode: string) =>
        request<ProjectMcpDTO[]>(
          config,
          'GET',
          `/api/projects/${encodeURIComponent(projectCode)}/mcps`,
        ),
      get: (id: string) => request<ProjectMcpDTO>(config, 'GET', `/api/project-mcps/${id}`),
      create: (projectCode: string, input: CreateProjectMcpInput) =>
        request<ProjectMcpDTO>(
          config,
          'POST',
          `/api/projects/${encodeURIComponent(projectCode)}/mcps`,
          input,
        ),
      patch: (id: string, input: PatchProjectMcpInput) =>
        request<ProjectMcpDTO>(config, 'PATCH', `/api/project-mcps/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/project-mcps/${id}`),
    },

    inbox: {
      list: (filters?: { unreadOnly?: boolean; projectId?: string }) => {
        const qs = new URLSearchParams()
        if (filters?.unreadOnly) qs.set('unreadOnly', 'true')
        if (filters?.projectId) qs.set('projectId', filters.projectId)
        const suffix = qs.toString() ? `?${qs.toString()}` : ''
        return request<InboxItemDTO[]>(config, 'GET', `/api/inbox${suffix}`)
      },
      unreadCount: (projectId?: string) => {
        const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
        return request<{ count: number }>(config, 'GET', `/api/inbox/unread-count${suffix}`)
      },
      markRead: (id: string) =>
        request<{ ok: true }>(config, 'POST', `/api/inbox/${encodeURIComponent(id)}/read`),
      markAllRead: (projectId?: string) => {
        const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
        return request<{ ok: true }>(config, 'POST', `/api/inbox/mark-all-read${suffix}`)
      },
      remove: (id: string) =>
        request<{ ok: true }>(config, 'DELETE', `/api/inbox/${encodeURIComponent(id)}`),
    },

    projectEnvs: {
      listForProject: (projectCode: string, environment?: ProjectEnvironment) => {
        const suffix = environment ? `?environment=${environment}` : ''
        return request<ProjectEnvDTO[]>(
          config,
          'GET',
          `/api/projects/${encodeURIComponent(projectCode)}/envs${suffix}`,
        )
      },
      create: (projectCode: string, input: CreateProjectEnvInput) =>
        request<ProjectEnvDTO>(
          config,
          'POST',
          `/api/projects/${encodeURIComponent(projectCode)}/envs`,
          input,
        ),
      patch: (id: string, input: PatchProjectEnvInput) =>
        request<ProjectEnvDTO>(config, 'PATCH', `/api/project-envs/${id}`, input),
      remove: (id: string) => request<{ ok: true }>(config, 'DELETE', `/api/project-envs/${id}`),
    },

    skills: {
      listForProject: (projectCode: string, agentKind = 'dev') =>
        request<{ skills: SkillPackInfo[]; disabled: string[] }>(
          config,
          'GET',
          `/api/skills/projects/${encodeURIComponent(projectCode)}?agentKind=${encodeURIComponent(agentKind)}`,
        ),
      toggle: (projectCode: string, name: string, disabled: boolean) =>
        request<{ disabled: string[] }>(
          config,
          'POST',
          `/api/skills/projects/${encodeURIComponent(projectCode)}/toggle`,
          { name, disabled },
        ),
    },

    health: () => request<{ ok: boolean; name: string; ts: number }>(config, 'GET', '/health'),
  }
}

export interface SkillPackInfo {
  name: string
  autoActive: boolean
  autoActivatedReason: string | null
  enabled: boolean
}

export type ApiClient = ReturnType<typeof createApiClient>
