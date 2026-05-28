# Tortuga Skills (bundled)

Curated technical knowledge per stack, **shipped with the product**. The
sidecar bundles this directory at build time and exposes it to agent runs
via `resolveSkillsForRun`. Each skill is a self-contained folder that
agents read when the project locks the matching stack.

## Layout

```
apps/sidecar/skills-bundled/
  README.md                 ← this file
  <skill-name>/
    skill.md                ← what the agent reads
    sources.json            ← official repos + docs
```

## Available skills

| Skill | When to activate | What it covers |
|---|---|---|
| `flutter/` | `preferredStack` matches `flutter*` | flutter_bloc, go_router, get_it, ThemeExtensions, anti-patterns, M3 gotchas |
| `supabase/` | `preferredStack` contains `supabase` OR backend = Supabase | RLS, migrations, triggers, realtime, auth, storage, edge functions, sbp_ vs sb_secret_ |
| `figma/` | Any agent with Figma MCP tools | Probe phase, multi-page protocol, page classification, URL parsing, fallbacks |
| `nextjs/` | `preferredStack` matches `nextjs*` | App Router, RSC, Server Actions, Tailwind v4, shadcn/ui, Drizzle/Prisma |
| `nestjs/` | `preferredStack` matches `nest*` | Clean/hexagonal layering, DI, DTO validation, guards/pipes/interceptors/filters, Jest |
| `angular/` | `preferredStack` matches `angular*` | Standalone components, signals, control flow, OnPush, typed forms, functional interceptors |
| `rest-api/` | Backend stack keyword (nest/express/api/rest) | Resource design, verbs/status, idempotency, pagination, versioning, RFC 7807, OpenAPI |
| `aws/` | Stack/signals mention AWS/Lambda/Cognito/S3/DynamoDB/API Gateway | Lambda, API Gateway, Cognito triggers, S3 presigned, DynamoDB single-table, IAM least-privilege |
| `iac/` | Any infra agent / provisions cloud | CDK (TS default) + Terraform, state/drift, env separation, tagging, secrets |
| `cicd-deploy/` | Any deploy/delivery agent | GitHub Actions, OIDC keyless AWS, real deploy + post-deploy smoke, blue/green, rollback |
| `testing/` | Agent role `qa-reviewer` / `senior-dev` | Test pyramid, per-feature test-file requirement, deterministic tests, Vitest/Jest/Playwright |
| `security/` | Agent role `security-reviewer` | OWASP Top 10, authz in handler, secrets mgmt, RLS multitenant, injection/XSS/CSRF/SSRF/IDOR |
| `accessibility/` | Agent role `product-designer` | WCAG 2.2 AA, semantic HTML, keyboard/focus, contrast, ARIA discipline, Flutter Semantics |
| `scoping/` | Agent role `scoping-architect` / `quote-auditor` | Decomposition, PERT/historical estimation, under-estimated work, estimate-vs-actuals loop |
| `git-workflow/` | Agent role `senior-dev` | Trunk-based, Conventional Commits, atomic commits, PR hygiene — NO AI-attribution trailers |

## How agents consume skills

The runner injects an `## Available skills` block into every agent's
initial prompt with the path to each relevant `skill.md`. Example
injected block:

```
## Available skills for this project

- flutter — see skills/flutter/skill.md
- supabase — see skills/supabase/skill.md
- figma — see skills/figma/skill.md

Read the relevant skill.md(s) BEFORE planning or implementing. The
skill defines anti-patterns that qa-reviewer will reject — follow
them from the start.
```

The agent uses its `Read` tool to load each skill file when relevant.

## Activation rules (resolved by runner)

`resolveSkillsForRun` (in `apps/sidecar/src/modules/skills/use-cases.ts`)
computes the list of applicable skills from:

1. **Stack keywords** — `projects.preferred_stack` plus extra signals
   (env keys, discovery text, integration names) are scanned against
   `STACK_KEYWORDS_TO_SKILLS` (flutter, supabase, nextjs, nestjs,
   angular, aws). A backend keyword (nest/express/api/rest) also pulls
   `rest-api`.
2. **Figma** — `projects.figma_file_url` presence, or an agent in
   `AGENTS_THAT_ALWAYS_GET_FIGMA`, or the `design-spec` step.
3. **Agent role** — cross-cutting skills via `ROLE_TO_SKILLS`:
   `qa-reviewer`→testing, `security-reviewer`→security,
   `product-designer`→accessibility, `scoping-architect`/`quote-auditor`→scoping,
   `senior-dev`→git-workflow + testing.

Per-project disables (`projects.disabled_skills_json`) drop any of the
above. The bundle build (`apps/sidecar/build.mjs`) copies all of
`apps/sidecar/skills-bundled/` as a resource, so a new pack ships
automatically.

Adding a new skill:

1. Create `apps/sidecar/skills-bundled/<name>/skill.md` and `sources.json`.
2. Update the table above.
3. Wire activation in `resolveSkillsForRun` — add a keyword to
   `STACK_KEYWORDS_TO_SKILLS` (stack skill) or a role to
   `ROLE_TO_SKILLS` (cross-cutting skill).

## Versioning

Each `sources.json` has `version` + `lastUpdated`. Bump when the skill
materially changes (new recommended library, deprecation).
