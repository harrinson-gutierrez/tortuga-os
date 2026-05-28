import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentKind, ProjectStack } from '@tortuga-os/contracts'
import { env } from '../../shared/env'

/**
 * Resolve which skill packs apply to an agent run.
 *
 * Activation rules (mirror apps/sidecar/skills-bundled/README.md):
 *   - Project stack maps to one or more stack skills.
 *   - The agent role (qa, designer, ...) pulls cross-cutting skills.
 *   - Figma is added when the project has a figma_file_url OR the agent
 *     role always benefits from it (designer).
 *
 * The function never throws and only returns skill names that physically
 * exist on disk (so a bundled drop of a pack doesn't break the runner).
 */

const STACK_TO_SKILLS: Record<ProjectStack, string[]> = {
  'flutter-supabase': ['flutter', 'supabase'],
  'flutter-local': ['flutter'],
  'nextjs-supabase': ['nextjs', 'supabase', 'rest-api'],
  'vite-react': ['nextjs', 'rest-api'],
  'node-fastify': ['nestjs', 'rest-api'],
  unknown: [],
}

const ROLE_TO_SKILLS: Partial<Record<AgentKind, string[]>> = {
  qa: ['testing'],
  designer: ['accessibility', 'figma'],
  tech_lead: ['git-workflow', 'testing'],
  arch: ['scoping'],
  pm: ['scoping'],
}

const DEV_ROLE_SKILLS = ['git-workflow', 'testing']

export interface ResolveSkillsInput {
  agentKind: AgentKind
  stack: ProjectStack
  figmaFileUrl?: string | null
  /** Names the operator has manually disabled for this project. */
  disabledSkills?: readonly string[]
}

export function resolveSkillsForRun(input: ResolveSkillsInput): string[] {
  const set = new Set<string>()
  for (const s of STACK_TO_SKILLS[input.stack] ?? []) set.add(s)
  for (const s of ROLE_TO_SKILLS[input.agentKind] ?? []) set.add(s)
  if (input.agentKind.startsWith('dev')) {
    for (const s of DEV_ROLE_SKILLS) set.add(s)
  }
  if (input.figmaFileUrl) set.add('figma')

  const disabled = new Set(input.disabledSkills ?? [])
  for (const d of disabled) set.delete(d)

  const skillsRoot = join(env.resourceDir, 'skills')
  return [...set].filter((name) => existsSync(join(skillsRoot, name, 'skill.md')))
}

/**
 * Catalog of every skill pack present on disk. Used by the project
 * skills panel to render the list with auto-activation reasons.
 */
export interface SkillPackInfo {
  name: string
  /** Whether the pack would be active for this project with NO manual disables. */
  autoActive: boolean
  /** Human-readable explanation of why the pack would auto-activate (or null). */
  autoActivatedReason: string | null
  /** Final effective state after applying the operator's disabled list. */
  enabled: boolean
}

export function listSkillPacksForProject(input: {
  agentKind: AgentKind
  stack: ProjectStack
  figmaFileUrl?: string | null
  disabledSkills: readonly string[]
}): SkillPackInfo[] {
  const skillsRoot = join(env.resourceDir, 'skills')
  if (!existsSync(skillsRoot)) return []

  const stackSkills = new Set(STACK_TO_SKILLS[input.stack] ?? [])
  const roleSkills = new Set(ROLE_TO_SKILLS[input.agentKind] ?? [])
  const devSkills = input.agentKind.startsWith('dev') ? new Set(DEV_ROLE_SKILLS) : new Set<string>()
  const figmaActive = !!input.figmaFileUrl

  const all = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => existsSync(join(skillsRoot, name, 'skill.md')))
    .sort()

  const disabled = new Set(input.disabledSkills)
  return all.map((name) => {
    const reasons: string[] = []
    if (stackSkills.has(name)) reasons.push(`stack ${input.stack}`)
    if (roleSkills.has(name)) reasons.push(`role ${input.agentKind}`)
    if (devSkills.has(name)) reasons.push('dev role default')
    if (figmaActive && name === 'figma') reasons.push('figma file linked')
    const autoActive = reasons.length > 0
    return {
      name,
      autoActive,
      autoActivatedReason: autoActive ? reasons.join(', ') : null,
      enabled: autoActive && !disabled.has(name),
    }
  })
}

/**
 * Build the `## Available skills` block injected at the top of an agent's
 * system prompt. The agent uses its Read tool to load each `skill.md`
 * when it's relevant to the current step. The runner exposes the skills
 * directory via an extra --add-dir, so the absolute paths are readable.
 *
 * Wording is deliberate: "Read absolute path" instead of the looser
 * "see <path>". The previous wording caused the Claude CLI to attempt a
 * `/skill flutter` slash command (no such command exists) before
 * falling back to Read. Stating the tool name avoids the mis-fire.
 */
export function renderSkillsBlock(skills: string[]): string {
  if (skills.length === 0) return ''
  const root = skillsRootPath()
  const lines = skills.map(
    (s) => `- **${s}** — use the Read tool on this absolute path: \`${join(root, s, 'skill.md')}\``,
  )
  return [
    '## Available skills for this project',
    '',
    'You have read-only access to a curated knowledge base. Each pack is a',
    'plain markdown file. The ONLY way to load one is the **Read** tool',
    'with the absolute path shown below. These are NOT slash commands; do',
    'not attempt `/skill <name>` — that will fail.',
    '',
    ...lines,
    '',
    'Read the relevant pack(s) BEFORE planning or implementing. Each pack',
    'lists anti-patterns the qa-reviewer agent will reject, so following',
    'them up-front saves an iteration.',
    '',
  ].join('\n')
}

/**
 * Returns the absolute path to the skills directory so callers can copy
 * (or symlink) it into a workspace if the agent's Read tool needs it
 * resolvable relative to its --add-dir root. The runner can read the
 * skills directly from the resource bundle for now.
 */
export function skillsRootPath(): string {
  return join(env.resourceDir, 'skills')
}
