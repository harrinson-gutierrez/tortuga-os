import { eq } from 'drizzle-orm'
// Project workspace: on-disk root with the quote, design, tasks, repos and
// deliverables. Covers: tree for a project without a workspace, ensure
// scaffolding + association, snapshot written on proposal instantiation, tree
// + file reads, and path-traversal rejection.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTests } from '../../apps/sidecar/src/shared/db'
import { projects as projectsTable } from '../../packages/db/src/schema'
import { type TestApp, apiFetch, buildTestApp } from '../helpers/test-app'
import { seedMinimal } from '../helpers/test-seed'

describe('workspace router', () => {
  let ctx: TestApp

  beforeEach(() => {
    ctx = buildTestApp()
  })
  afterEach(() => {
    resetDbForTests()
  })

  it('GET /api/workspace/:code → root null when the project has no workspace', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/workspace/TST1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { projectCode: string; root: string | null; tree: unknown[] }
    expect(body.projectCode).toBe('TST1')
    expect(body.root).toBeNull()
    expect(body.tree).toEqual([])
  })

  it('POST /api/workspace/:code/ensure creates the folders and associates the path', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    const res = await apiFetch(ctx.app, '/api/workspace/TST1/ensure', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { projectCode: string; root: string }
    expect(body.root).toContain('TST1')

    const proj = await ctx.db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, seeded.projectIds[0]!))
      .get()
    expect(proj!.workspacePath).toBe(body.root)

    const tree = await apiFetch(ctx.app, '/api/workspace/TST1')
    const treeBody = (await tree.json()) as {
      root: string | null
      tree: Array<{ name: string; type: string }>
    }
    expect(treeBody.root).toBe(body.root)
    const names = treeBody.tree.map((n) => n.name).sort()
    expect(names).toContain('01-cotizacion')
    expect(names).toContain('04-repos')
    expect(names).toContain('05-entregables')
    expect(names).toContain('README.md')
  })

  it('reads a workspace file and rejects path traversal', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    await apiFetch(ctx.app, '/api/workspace/TST1/ensure', { method: 'POST' })

    const ok = await apiFetch(ctx.app, '/api/workspace/TST1/file?path=README.md')
    expect(ok.status).toBe(200)
    const okBody = (await ok.json()) as { content: string; binary: boolean }
    expect(okBody.binary).toBe(false)
    expect(okBody.content).toContain('Workspace')

    const bad = await apiFetch(ctx.app, '/api/workspace/TST1/file?path=../../../etc/passwd')
    expect(bad.status).toBeGreaterThanOrEqual(400)
  })

  it('missing query param path → 400', async () => {
    await seedMinimal(ctx.db, { clients: 1, projects: 1 })
    await apiFetch(ctx.app, '/api/workspace/TST1/ensure', { method: 'POST' })
    const res = await apiFetch(ctx.app, '/api/workspace/TST1/file')
    expect(res.status).toBe(400)
  })

  it('instantiating a proposal leaves the snapshot in 01-cotizacion/', async () => {
    const seeded = await seedMinimal(ctx.db, { clients: 1 })
    const created = await apiFetch(ctx.app, '/api/proposals', {
      method: 'POST',
      body: {
        clientId: seeded.clientIds[0]!,
        kind: 'commercial',
        currency: 'USD',
        projectCode: 'WSP1',
        totalAmountCents: 100_000,
        contractedHours: 40,
        modules: [
          { key: 'm1', label: 'Module 1', estimateHours: 40, needsDesign: false, taskTags: [] },
        ],
        milestones: [{ num: 1, label: 'Single', dueDate: 1_700_000_000_000, amountCents: 100_000 }],
        members: [],
      },
    })
    const { id } = (await created.json()) as { id: string }
    for (const s of ['sent', 'negotiation', 'signed']) {
      await apiFetch(ctx.app, `/api/proposals/${id}/transition`, {
        method: 'POST',
        body: { toStatus: s },
      })
    }
    const inst = await apiFetch(ctx.app, `/api/proposals/${id}/instantiate`, {
      method: 'POST',
      body: {},
    })
    expect(inst.status).toBe(200)

    const proj = await apiFetch(ctx.app, '/api/projects/WSP1')
    const projBody = (await proj.json()) as {
      project: { workspacePath: string | null; repoPaths: string[] }
    }
    expect(projBody.project.workspacePath).toBeTruthy()
    expect(projBody.project.repoPaths.some((p) => p.endsWith('04-repos'))).toBe(true)

    const tree = await apiFetch(ctx.app, '/api/workspace/WSP1')
    const treeBody = (await tree.json()) as {
      tree: Array<{ name: string; type: string; children?: Array<{ name: string }> }>
    }
    const cotDir = treeBody.tree.find((n) => n.name === '01-cotizacion')
    expect(cotDir).toBeTruthy()
    expect(cotDir!.children?.some((c) => c.name === 'cotizacion-v1.md')).toBe(true)

    const file = await apiFetch(
      ctx.app,
      '/api/workspace/WSP1/file?path=01-cotizacion/cotizacion-v1.md',
    )
    expect(file.status).toBe(200)
    const fileBody = (await file.json()) as { content: string }
    expect(fileBody.content).toContain('Quote')
    expect(fileBody.content).toContain('WSP1')
  })
})
