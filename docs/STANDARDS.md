# Tortuga OS — Development standards

> Master document. Applies to the **whole monorepo** (`apps/desktop`, `apps/web`, `apps/sidecar`, `packages/*`).
> Internal quality standards for maintainability: the code must be readable, auditable and safe to evolve.

This document is split into three axes:

1. [Security](#1-security)
2. [Optimization and performance](#2-optimization-and-performance)
3. [Development patterns](#3-development-patterns)

Every rule carries a severity marker:

- **MUST** — blocking. PRs that violate it are rejected.
- **SHOULD** — strong convention; deviations require justification in the PR.
- **MAY** — recommendation; context-dependent.

---

## 1. Security

### 1.1 Threat model

Tortuga OS is a **desktop app** that runs three processes on the user's machine:

```
┌─────────────────────────┐
│  Tauri shell (Rust)     │  ← privileged processes (fs access)
│  ─ WebView (React UI)   │
│  ─ child: sidecar (Node)│  ← Hono :31415 only listens on 127.0.0.1
└─────────────────────────┘
                 ↑
                 │ stdio
┌─────────────────────────┐
│  Claude CLI / Desktop   │  ← external MCP client (user opt-in)
└─────────────────────────┘
```

Relevant attack surfaces:

| Vector | Risk | Mitigation |
|---|---|---|
| HTTP sidecar `:31415` | Another local process could send requests to the port | Bind to `127.0.0.1`, mandatory secret header (see §1.6), never `0.0.0.0` |
| WebView (remote load) | XSS if untrusted external HTML is loaded | Strict CSP in `tauri.conf.json` (see §1.3), never `eval`, never `dangerouslySetInnerHTML` with external input |
| MCP server stdio | A malicious client (the model) could attempt SQLi, path traversal, data exfiltration | Zod validation on every tool, tool allowlist, no fs access outside the project paths |
| Drizzle / SQLite | Injection if strings are concatenated | Parameterized APIs only (see §1.2) |
| Auto updates | Binary tampering | Release signing (future Tauri updater with Ed25519 key) |
| Secrets in repo | Token / API key leakage | `.gitignore` + gitleaks in pre-commit + scan in CI |

### 1.2 Input validation

**MUST** — every input that crosses a boundary (HTTP, MCP, Tauri IPC, parsing of agent markdown, file I/O) goes through a Zod schema **before** touching business logic. The boundary owns validation; the inner layer assumes correct types.

**Canonical pattern (Hono + Zod):**

```ts
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const CreateProjectSchema = z.object({
  clientId: z.string().uuid(),
  code: z.string().min(2).max(16).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(1).max(120),
  contractedAmountCents: z.number().int().nonnegative(),
})

projectsRouter.post(
  '/',
  zValidator('json', CreateProjectSchema),
  async (c) => {
    const input = c.req.valid('json') // ← typed and validated
    return c.json(await uc.createProject(input), 201)
  },
)
```

**MUST NOT** — pass `await c.req.json()` straight to the use-case (the previous pattern in `apps/sidecar/src/modules/projects/routes.ts`). That delegates validation to the use-case and breaks the boundary.

**Tauri commands**: every `#[tauri::command]` receives typed Rust parameters (`serde::Deserialize`). If a parameter is a free-form `String`, validate it inside the body (regex/allowlist) before using it.

**MCP tools**: handlers receive `params: unknown` per the SDK contract. Every handler MUST start with `Schema.parse(params)`.

### 1.3 Tauri — native surface

**`tauri.conf.json`:**

- **MUST** — define a strict CSP. `"csp": null` leaves the WebView fully open and is blocking. Minimal valid CSP example:
  ```json
  "csp": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' http://127.0.0.1:31415 ipc: http://ipc.localhost"
  ```
  The `unsafe-inline` in `style-src` is required by Tailwind/styled JSX. Drop `unsafe-eval`.
- **MUST** — `app.windows[].decorations` and `transparent` reviewed for security (clickjacking).
- **MUST** — block opening external URLs via `tauri://`. If an external link must be opened, use `tauri-plugin-shell open` with an allowlist (not `shell: { all: true }`).

**`capabilities/default.json`:**

```json
"permissions": [
  "core:default", "core:window:default", "core:webview:default",
  "core:event:default", "core:menu:default", "log:default"
]
```

- **MUST NOT** — add `fs:allow-*` or `shell:allow-execute` without an explicit scope (`{ "identifier": "fs:allow-read-file", "allow": [{"path": "$APPDATA/Tortuga-OS/**"}] }`).
- **SHOULD** — split capabilities per window once auxiliary windows are introduced (settings, log modal, etc.).

**IPC validation**: a `tauri::command` receiving user paths MUST resolve them against a fixed root and verify the prefix:

```rust
let root = app.path().app_data_dir()?;
let resolved = root.join(&user_path).canonicalize()?;
if !resolved.starts_with(&root) { return Err("path escape"); }
```

### 1.4 SQL — parameterized Drizzle only

**MUST** — all queries use Drizzle (`db.select`, `db.insert`, `db.update`, `db.delete`) or `sql\`...\`` with bindings (`sql\`SELECT * FROM ${table} WHERE id = ${id}\``).

**MUST NOT** — `db.run(\`SELECT ... WHERE x = '${value}'\`)` (string interpolation). Any legitimate need for raw SQL goes through `sql.raw` **only** over controlled identifiers (table names derived from a code-level enum).

**SHOULD** — repositories live in `packages/db` or in `apps/sidecar/src/modules/<feature>/use-cases.ts`. The UI never imports Drizzle directly.

### 1.5 Secrets

- **MUST** — `.env` and `.env.*.local` are in `.gitignore` (✅ already).
- **MUST** — no token/API key/high-entropy string is ever committed. Pre-commit check with **gitleaks** (`.gitleaks.toml` at the root).
- **MUST** — the release binary embeds no secrets. If Tortuga needs an API key (Anthropic, etc.), the user enters it at runtime and it is stored in the OS keychain (`tauri-plugin-stronghold` or `keytar`), never in `tortuga.db`.
- **SHOULD** — gitleaks scan also in CI.

### 1.6 Sidecar HTTP — defense in depth

The Hono sidecar listens on `127.0.0.1:<random>` and the Tauri shell parses the port from stdout. This avoids network exposure, but **does not prevent** another process owned by the same user from sending requests to the port.

**MUST** — add a **handshake secret** generated by the shell at boot:

```ts
// shell passes to the sidecar:
//   process.env.TORTUGA_SIDECAR_SECRET = crypto.randomUUID()
// Hono validates in middleware:
app.use('/api/*', async (c, next) => {
  if (c.req.header('x-tortuga-secret') !== env.secret) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
})
```

The web client injects the header in the `fetch` wrapper. The secret is never logged (see §1.7).

**MUST NOT** — bind to `0.0.0.0` or `::`.

**MUST** — strict CORS. Restrict to the Tauri origins (`tauri://localhost`, `http://tauri.localhost`) and the dev server `http://localhost:5173` **only when `NODE_ENV !== 'production'`**.

### 1.7 Safe logging

- **MUST NOT** log: tokens, Authorization headers, full request bodies with PII (emails, taxId, contacts), the user's absolute paths, client file contents.
- **SHOULD** — use Pino with redaction configured:
  ```ts
  pino({ redact: ['headers.authorization', 'headers["x-tortuga-secret"]', 'body.contactEmail', 'body.taxId'] })
  ```
- **MUST** — errors returned to the client do NOT include stack traces (only in `isDev`). Pattern: `errorHandler` maps `unknown → { error: 'internal' }` in prod, keeps the stack in dev.

### 1.8 MCP server stdio

Tortuga exposes a set of tools to the model. The model is NOT trusted: any input may be adversarial.

- **MUST** — every tool starts with `Schema.parse(args)` (strict Zod, no `.passthrough()`).
- **MUST** — per-tool timeouts (default 5s, configurable). Queries that potentially scan many rows use an explicit `LIMIT`.
- **MUST** — output payload limit (e.g. 100 KB). If exceeded, truncate and return a message + `count` instead of the full array.
- **MUST** — `move_task` requires a human signature (`humanSignature: string`) when the destination column is `SECURITY_READY`, `DELIVERY_READY` or `DONE`. The signature is persisted in `kanbanMovements` (auditable).
- **SHOULD** — INFO log per tool call with `tool, durationMs, inputHash, ok`. Do NOT log the full input.

### 1.9 Path traversal

**MUST** — any `fs.readFile/writeFile` whose path comes (partly or fully) from the user or the model:

1. Resolve with `path.resolve(rootDir, userInput)`.
2. Verify `resolved.startsWith(rootDir + path.sep)`.
3. Reject if it does not match.

Applies to: importing agent markdowns (`packages/agents/`), task attachments, report exports.

### 1.10 Dependencies

- **MUST** — `pnpm-lock.yaml` committed (✅ already).
- **MUST** — `pnpm audit --audit-level=high` runs in CI; blocks the merge on High/Critical vulnerabilities without a documented exception.
- **SHOULD** — Dependabot grouping updates: `npm-minor-patch` weekly automatic; `npm-major` manual; `cargo` weekly.
- **SHOULD** — block known-deprecated packages (list in `package.json#pnpm.allowedDeprecatedVersions`).

---

## 2. Optimization and performance

### 2.1 React (apps/web)

- **SHOULD** — no inline objects/arrays in props that trigger re-renders of memoized children:
  ```tsx
  // bad: new object every render
  <Kanban filters={{ status: 'open' }} />
  // good
  const filters = useMemo(() => ({ status: 'open' }), [])
  <Kanban filters={filters} />
  ```
- **SHOULD** — `React.memo` only when the profiler justifies it. Memoizing everything by default is counterproductive.
- **MAY** — adopt React Compiler when it stabilizes; it lets you remove most manual `useMemo`/`useCallback`.
- **MUST** — stable keys in lists (`task.id`, not `index`).
- **MUST NOT** — use `useEffect` to sync derived state. Compute it in render or with `useMemo`.

### 2.2 TanStack Query

Recommended cache table by entity type (defaults; adjust per `queryKey`):

| Type | `staleTime` | `gcTime` | Rationale |
|---|---|---|---|
| Static config (agent list from MD) | `Infinity` | `Infinity` | Only changes when the file is edited |
| Project / client list | 60 s | 5 min | Changes rarely; revalidate on tab focus |
| Kanban board (task list) | 10 s | 2 min | Changes often via the watcher |
| Task / project detail | 30 s | 5 min | Read after click |
| Agent-run stream (SSE) | n/a (no Query, direct EventSource) | n/a | Server push |

**MUST** — every mutation that touches an entity invalidates its lists:

```ts
const mutation = useMutation({
  mutationFn: api.tasks.update,
  onSuccess: (data) => {
    queryClient.invalidateQueries({ queryKey: ['kanban', data.projectCode] })
    queryClient.invalidateQueries({ queryKey: ['task', data.id] })
  },
})
```

**SHOULD** — optimistic updates for moving tasks on the kanban (drag&drop latency must be zero).

### 2.3 Bundle (apps/web)

- **SHOULD** — analyze the bundle at least before each release with `vite-bundle-visualizer`. Target: initial JS gzip bundle ≤ 250 KB.
- **MUST** — heavy modals (proposal editor, agent log viewer) use `lazy()` + `<Suspense>`.
- **MUST** — route-level code splitting via TanStack Router (file-based routing already supports this).
- **MUST NOT** — import all of `lucide-react` with `import * as Icons`. Use named imports (`import { Plus } from 'lucide-react'`).
- **SHOULD** — `framer-motion` lazy load: only import it on screens with animation.

### 2.4 SQLite

- **MUST** — WAL mode on: `db.pragma('journal_mode = WAL')` at boot.
- **MUST** — `synchronous = NORMAL` (balance between durability and throughput for a local DB).
- **MUST** — indexes on frequently-filtered columns: `tasks.projectId`, `tasks.status`, `kanbanMovements.taskId`, `agentRuns.agentName`. (Drizzle: `index('idx_...').on(...)`).
- **SHOULD** — periodic `VACUUM` (monthly or when `freelist_count > 1000`) run from an admin menu.
- **MUST** — idempotent migrations (`drizzle-kit generate` produces incremental SQL; never edit already-applied migrations).
- **MUST** — schema and queries use transactions (`db.transaction(...)`) for any multi-table operation (e.g. moving a task + inserting a `kanbanMovement` + emitting an internal webhook).

### 2.5 Rust shell

- **MUST NOT** — `unwrap()` or `expect()` in code that runs after boot. In `main()` and setup it is acceptable because the panic is reported. Convert to `?` with an own error type.
- **MUST** — blocking operations (file reads, spawning the sidecar) use `tokio::task::spawn_blocking` or async `tokio::process::Command`.
- **MUST** — the sidecar stdout watcher reads line by line with a bounded buffer to avoid OOM if the sidecar emits a lot of log.

### 2.6 Assets

- **SHOULD** — icons: inline SVG for UI icons (via `lucide-react`); PNG only for the bundle icon.
- **SHOULD** — illustrative images: WebP (fallback PNG if minimum support requires it). Max 200 KB each.
- **MUST NOT** — binary assets > 1 MB in the repo (use Git LFS or an external reference).

---

## 3. Development patterns

### 3.1 Layered architecture

**Sidecar (`apps/sidecar/src/modules/<feature>/`):**

```
routes.ts        ← HTTP/MCP boundary. Zod validation. No logic.
use-cases.ts    ← Business logic. Orchestrates repositories. No Hono.
mappers.ts      ← DB row → DTO. Pure, no side effects.
repository.ts   ← Drizzle queries. No business logic (CRUD/queries only).
```

**Dependency rule** (only flows down, never up):

```
routes  →  use-cases  →  repository  →  db schema
   ↓          ↓              ↓
mappers (importable from anywhere)
```

**Web (`apps/web/src/`):**

```
routes/         ← TanStack Router. Lazy boundaries. No logic.
features/       ← Components and logic per domain (kanban/, tasks/, projects/).
components/     ← Reusable UI primitives (no domain).
hooks/          ← Custom hooks (includes useQuery/useMutation wrappers).
api/            ← fetch client + types. The only place that knows the sidecar URLs.
shared/         ← Utils, helpers, types shared across web.
```

`features/*` may import `components/`, `hooks/`, `api/`. **NOT** the other way around.

### 3.2 Error handling

**MUST** — typed errors. Domain errors in `apps/sidecar/src/shared/errors.ts` (`NotFoundError`, `ValidationError`, `ConflictError`, `UnauthorizedError`). Each with `statusCode` and `code` (stable string for clients).

**MUST NOT** — `throw` with a string:

```ts
throw 'project not found'           // ❌
throw new Error('project not found') // ❌ untyped
throw new NotFoundError('Project ABC') // ✅
```

**MUST NOT** — `catch (e: any)` without re-narrowing:

```ts
// bad
catch (e: any) { logger.error(e.message) }
// good
catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  logger.error({ err: e }, msg)
}
```

**MAY** — for very high-volume flows where throwing is costly, use `Result<T, E>` (neverthrow or an own type). Not mandatory elsewhere.

### 3.3 TypeScript

`tsconfig.base.json` (target) MUST include:

```jsonc
{
  "strict": true,
  "noImplicitAny": true,
  "noUncheckedIndexedAccess": true,    // ✅ already
  "noUnusedLocals": true,              // ✅ already
  "noUnusedParameters": true,          // ✅ already
  "noFallthroughCasesInSwitch": true,  // ✅ already
  "exactOptionalPropertyTypes": true,  // ⚠️ pending
  "noImplicitOverride": true,          // ⚠️ pending
  "noImplicitReturns": true,           // ⚠️ pending
  "forceConsistentCasingInFileNames": true // ✅ already
}
```

> The ⚠️ flags are not enabled yet because they can generate typecheck errors in existing code. See `STANDARDS_AUDIT.md` for the migration plan.

**Type rules:**

- **MUST NOT** — `any` (Biome `noExplicitAny: warn` → raise to `error`). Exception: edges with untyped libraries, justified in a comment.
- **MUST NOT** — `as unknown as X` (double-cast to bypass the checker) without a `// SAFETY: <reason>` comment.
- **MUST** — prefer `unknown` over `any` when the shape is genuinely unknown; narrow it.
- **MUST** — use `import type` for purely type imports (Biome `useImportType: warn` → keep at least at warn).

### 3.4 Naming

- **Files**: `kebab-case.ts` / `kebab-case.tsx` (`use-cases.ts`, `kanban-board.tsx`).
- **React components**: `PascalCase` (`KanbanBoard`, `TaskCard`).
- **Functions / variables**: `camelCase`.
- **Global constants**: `SCREAMING_SNAKE_CASE`.
- **Types / interfaces**: `PascalCase`. `DTO` suffix for transport objects. `Schema` suffix for Zod schemas.
- **Feature folders**: singular (`feature/`, `module/`) — the containing root folder may be plural (`features/`, `modules/`). Current sidecar: `modules/projects/` ✅.

### 3.5 Comments

- **MUST** — explain the **why** (decisions, trade-offs, historical context). The code already says the what.
- **MUST** — JSDoc on public APIs exported from `packages/*` (with `@param`, `@returns`, `@throws`).
- **MUST NOT** — obvious comments (`// increment counter`).
- **SHOULD** — `TODO(@user|YYYY-MM-DD)`: include owner and/or date. Without an owner, TODOs become rubble.

### 3.6 Testing — minimum strategy

| Layer | Tool | What is tested | Severity |
|---|---|---|---|
| `packages/shared-types` (Zod) | Vitest | Each schema accepts its valid shape and rejects invalid variants | **MUST** |
| `packages/db` (mappers) | Vitest | Mapper `db row → DTO` round trip | **MUST** |
| `apps/sidecar` endpoints | Vitest + Hono testClient | Contract: each endpoint responds with the declared Zod shape | **SHOULD** |
| `apps/sidecar` use-cases with DB | Vitest + better-sqlite3 in-memory | Critical business logic (margin calc, kanban moves with guards) | **SHOULD** |
| `apps/web` components | — | No coverage requirement for now | — |
| MCP tools | Vitest | Each tool validates input and returns the expected shape | **MUST** |
| Tauri Rust | `cargo test` | Path resolution, sidecar stdout parsing | **SHOULD** |

**MUST NOT** — mock the DB in sidecar tests. Use in-memory SQLite (`better-sqlite3` supports `:memory:`) to keep fidelity with prod.

### 3.7 Commits and branches

- **MUST** — strict Conventional Commits (`commitlint` with `@commitlint/config-conventional`).
  - Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `style`, `revert`.
  - Scope optional but recommended: `feat(kanban): ...`, `fix(sidecar): ...`.
  - Subject ≤ 72 characters; subject casing is lenient.
- **MUST** — every commit passes `pnpm typecheck` and `pnpm lint` locally (pre-commit hook).
- **SHOULD** — trunk-based: `main` always green, short branches, rebase before merging.

### 3.8 PRs

Checklist in `.github/PULL_REQUEST_TEMPLATE.md`:

- [ ] Title is a valid Conventional Commit.
- [ ] `pnpm typecheck` green.
- [ ] `pnpm lint` green.
- [ ] Tests added/updated if applicable.
- [ ] No breaking changes in public APIs (or `BREAKING CHANGE` in the footer).
- [ ] Docs updated (README, JSDoc comments).
- [ ] No secrets, absolute user paths, or personal data in the diff.

### 3.9 Versioning

- **MUST** — SemVer (`MAJOR.MINOR.PATCH`). While on `0.x`, breaking changes may land in MINOR (that is the semver contract for 0.x).
- **SHOULD** — use Changesets (`@changesets/cli`) when publishing npm packages or cutting versioned releases.
- **MUST** — `CHANGELOG.md` autogenerated from commits (once Changesets lands).

---

## Appendix A — Concrete tooling

| Need | Tool | Status |
|---|---|---|
| Lint + format | Biome | ✅ installed |
| Typecheck | tsc | ✅ |
| Pre-commit hooks | Husky + lint-staged | ⚠️ pending |
| Commit lint | commitlint | ⚠️ pending (config at root, hook in husky) |
| Secrets scan | gitleaks | ⚠️ pending |
| CI | GitHub Actions | ⚠️ base workflow pending |
| Deps updates | Dependabot | ⚠️ pending |
| Tests | Vitest | ✅ installed |
| Bundle analysis | vite-bundle-visualizer | ⚠️ ad-hoc |

See `STANDARDS_AUDIT.md` for the closure plan.

---

## Appendix B — How to propose changes to this document

This document is binding for PRs. To change it:

1. Open a PR with `docs(standards): ...`.
2. Justify the change in the description (problem, alternative considered, impact).
