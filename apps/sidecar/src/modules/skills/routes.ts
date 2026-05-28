import { Hono } from 'hono'
import { coreDeps } from '../../shared/core-deps'
import { ValidationError } from '../../shared/errors'
import { listSkillPacksForProject } from './use-cases'

function parseDisabledSkills(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed
  } catch {
    /* fall through */
  }
  return []
}

export const skillsRouter = new Hono()
  // List every skill pack present on disk, annotated with whether it
  // would auto-activate for this project and the operator's manual
  // disable state. The `agentKind` query is optional and defaults to
  // 'dev' so the panel preview matches what most runs see.
  .get('/projects/:code', async (c) => {
    const deps = coreDeps()
    const project = await deps.storage.getProjectByCode(c.req.param('code'))
    if (!project) throw new ValidationError(`project not found: ${c.req.param('code')}`)
    const agentKind = (c.req.query('agentKind') ?? 'dev') as never
    const disabled = parseDisabledSkills(project.project.disabledSkillsJson)
    return c.json({
      skills: listSkillPacksForProject({
        agentKind,
        stack: project.project.stack,
        disabledSkills: disabled,
      }),
      disabled,
    })
  })

  // Toggle a single skill on/off for this project. POST body shape:
  //   { name: 'flutter', disabled: true }
  // The skill's name must be one already present on disk; otherwise the
  // call is a no-op (no row is created for a phantom pack).
  .post('/projects/:code/toggle', async (c) => {
    const deps = coreDeps()
    const project = await deps.storage.getProjectByCode(c.req.param('code'))
    if (!project) throw new ValidationError(`project not found: ${c.req.param('code')}`)
    const body = (await c.req.json()) as { name?: unknown; disabled?: unknown }
    if (typeof body.name !== 'string' || typeof body.disabled !== 'boolean') {
      throw new ValidationError('body must be { name: string, disabled: boolean }')
    }
    const current = new Set(parseDisabledSkills(project.project.disabledSkillsJson))
    if (body.disabled) current.add(body.name)
    else current.delete(body.name)
    const nextJson = JSON.stringify([...current].sort())
    await deps.storage.patchProject(
      project.project.id,
      { disabledSkillsJson: nextJson },
      Date.now(),
    )
    return c.json({ disabled: [...current].sort() })
  })
