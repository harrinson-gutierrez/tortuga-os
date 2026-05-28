import type {
  ClientRow,
  EvidenceRow,
  GateRow,
  IterationRow,
  PersonRow,
  PhaseRow,
  ProjectRow,
  QuoteRow,
  TaskRow,
  WorkEntryRow,
} from '@tortuga-os/core'
import { nextId } from './ids'

const NOW = 1_710_000_000_000

export function aClient(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: nextId('client'),
    name: 'Acme Co',
    taxId: null,
    contactEmail: null,
    driveFolderId: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

export function aPerson(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: nextId('person'),
    name: 'Test Person',
    email: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

export function aProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: nextId('project'),
    code: 'TEST',
    clientId: 'client-000001',
    name: 'Test Project',
    description: null,
    status: 'draft',
    currency: 'COP',
    stack: 'unknown',
    workspacePath: null,
    startedAt: NOW,
    closedAt: null,
    disabledSkillsJson: '[]',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  }
}

export function aPhase(overrides: Partial<PhaseRow> = {}): PhaseRow {
  return {
    id: nextId('phase'),
    projectId: 'project-000001',
    type: 'F1_SALES',
    status: 'in_progress',
    iteration: 1,
    ownerRole: 'sales',
    artifactPath: null,
    startedAt: NOW,
    closedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function aQuote(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: nextId('quote'),
    phaseId: 'phase-000001',
    version: 1,
    status: 'draft',
    totalHoursMin: 0,
    totalCostCents: 0,
    discountBps: 0,
    approvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function aTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: nextId('task'),
    code: 'TEST-001-T1',
    storyId: 'story-000001',
    type: 'impl',
    ownerRole: 'dev',
    assignee: null,
    status: 'pending',
    currentIteration: 1,
    estimatedHoursMin: 0,
    actualHoursMin: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function anIteration(overrides: Partial<IterationRow> = {}): IterationRow {
  return {
    id: nextId('iter'),
    taskId: 'task-000001',
    n: 1,
    startedAt: NOW,
    closedAt: null,
    outcome: null,
    closedByRole: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function aGate(overrides: Partial<GateRow> = {}): GateRow {
  return {
    id: nextId('gate'),
    taskId: 'task-000001',
    iterationId: 'iter-000001',
    gateType: 'G1_ANALYZE',
    status: 'pending',
    outputPath: null,
    ranAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function anEvidence(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
  return {
    id: nextId('ev'),
    taskId: 'task-000001',
    iterationId: 'iter-000001',
    type: 'dev',
    kind: 'video',
    path: '05-build/STORY-001/tasks/T1/dev-evidence/run.mp4',
    createdByRole: 'dev',
    createdByAssignee: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

export function aWorkEntry(overrides: Partial<WorkEntryRow> = {}): WorkEntryRow {
  return {
    id: nextId('we'),
    iterationId: 'iter-000001',
    taskId: 'task-000001',
    personId: 'person-000001',
    role: 'dev',
    minutes: 60,
    reworkTicketId: null,
    notes: null,
    loggedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}
