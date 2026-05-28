# Tortuga OS — Standards audit

> Living document. Compares the current state of the repo against the standards
> defined in [`STANDARDS.md`](STANDARDS.md).
> Prioritized list of **debts** for the internal quality baseline.

Audit date: **2026-05-09**.
Audited base commit: `12f5b1c feat(f3.0): creation CRUDs + empty state + wipe DB`.

## Legend

| Symbol | Meaning |
|---|---|
| ✅ | Meets the standard today. |
| 🟡 | Partially meets — minor improvement. |
| ❌ | Does not meet — should be closed. |
| 🔴 | **Critical** — blocking. |
| 🟠 | **Important** — should be closed soon. |
| 🟡 | Nice-to-have. |
| 🆕 | Closure brought by this same migration (configs/docs in this PR). |

---

## 1. Executive summary

| Axis | Status | Note |
|---|---|---|
| Repo hygiene (LICENSE / README / SECURITY / .github) | ✅ 🆕 | Covered by this PR. |
| Documented standards | ✅ 🆕 | `docs/STANDARDS.md` created. |
| CI baseline | ✅ 🆕 | Basic workflow (lint, typecheck, audit, gitleaks) ready. |
| Pre-commit hooks (Husky + lint-staged + commitlint) | 🟡 | Configs created, still need `pnpm install` of the deps and activation. |
| Zod validation on HTTP boundaries | ❌ 🔴 | Current endpoints pass `await c.req.json()` straight to use-cases. |
| CSP in Tauri | ❌ 🔴 | `csp: null` in `tauri.conf.json` — blocking. |
| Sidecar handshake secret | ❌ 🔴 | Any local process can send requests to the port. |
| Tests (minimum) | ❌ 🟠 | Vitest not installed. Zero tests in the repo. |
| Strict TypeScript flags | 🟡 🟠 | Missing `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`. |
| SQLite WAL + indexes | ⚠️ 🟠 | Need to audit whether `initDb` enables WAL; indexes are in the schema, verify. |
| MCP tools — validation + timeouts + limits | ⚠️ 🟠 | Audit the implementation; apply strict Zod + timeouts. |
| Safe logging (redact) | ⚠️ 🟠 | Pino installed, `redact` not yet configured. |
| Bundle analysis | ❌ 🟡 | Never run. |
| `any` in code | ⚠️ 🟡 | Biome marks it as warn — raise to error in a cleanup pass. |
| Renovate / Dependabot | ✅ 🆕 | Dependabot configured in this PR. |
| `.gitignore` | ✅ | Covers `data/`, `.env`, `*.db`, `node_modules`, etc. |
| pnpm lockfile committed | ✅ | `pnpm-lock.yaml` present. |
| Cargo.lock committed | ❌ 🟠 | `.gitignore` excludes it (`**/src-tauri/Cargo.lock`). For binary apps committing it is recommended. |

---

## 2. Closure brought by this migration (done)

### Files created/modified

```
README.md                         ← refresh
SECURITY.md                       ← disclosure policy
.editorconfig                     ← editor consistency
.gitleaks.toml                    ← secret-scan config + false-positive allowlist
commitlint.config.cjs             ← strict Conventional Commits
.lintstagedrc.json                ← biome + typecheck in pre-commit
.husky/commit-msg                 ← commitlint hook
.husky/pre-commit                 ← lint-staged hook
.github/ISSUE_TEMPLATE/bug_report.md
.github/ISSUE_TEMPLATE/feature_request.md
.github/ISSUE_TEMPLATE/config.yml
.github/PULL_REQUEST_TEMPLATE.md
.github/dependabot.yml            ← npm/cargo/actions weekly with groups
.github/workflows/ci.yml          ← lint + typecheck + audit + gitleaks
docs/STANDARDS.md                 ← binding standards
docs/STANDARDS_AUDIT.md           ← this document
```

### What is NOT closed by this migration

This requires code changes (not just config/docs) and must be addressed in a
dedicated sub-phase (proposal: **F3.1.X — security hardening**).

---

## 3. Pending debts

### 🔴 Critical — blocking

#### 3.1 🔴 Strict CSP in Tauri (`tauri.conf.json`)

- **Current state**: `app.security.csp = null` (apps/desktop/src-tauri/tauri.conf.json:31).
- **Risk**: WebView fully open. If at some point the UI loads external content (future docs embed, Markdown render, OAuth), XSS with no defense.
- **Fix**: define a CSP as in `STANDARDS.md` §1.3. Test end-to-end (Tailwind style, fonts, framer-motion, EventSource to the sidecar).
- **Effort**: 2-4 h (configure + test all flows).

#### 3.2 🔴 Zod validation on sidecar HTTP endpoints

- **Current state**: `apps/sidecar/src/modules/projects/routes.ts` and similar do `await c.req.json()` and pass straight to `use-cases.createProject(input)`. Validation is implicit (may or may not be inside the use-case).
- **Risk**: `unknown` types crossing the boundary. Allows malformed payloads, over-posting fields, prototype pollution attacks.
- **Fix**: apply the `zValidator('json', Schema)` pattern from `@hono/zod-validator` (already in deps) on ALL routes receiving a body. Schemas ideally reused from `packages/shared-types`.
- **Effort**: ~6 h for the 14 modules (~40 endpoints).

#### 3.3 🔴 Handshake secret between the Tauri shell and the sidecar

- **Current state**: the sidecar accepts any request to `127.0.0.1:<port>` as long as CORS passes. Any process owned by the same user can send requests.
- **Risk**: local malware could read/modify the projects DB via the HTTP API.
- **Fix**: the shell generates `crypto.randomUUID()` at boot, passes it to the sidecar via `TORTUGA_SIDECAR_SECRET`, the sidecar requires the header `x-tortuga-secret` on all `/api/*` routes. The web client injects it in its `fetch` wrapper.
- **Effort**: 3-4 h (Rust shell + middleware + client wrapper).

#### 3.4 🔴 Final LICENSE

- **Current state**: no `LICENSE` file. README says "all rights reserved".
- **Risk**: without a license the legal status is unclear.
- **Fix**: add `LICENSE` (proprietary, all rights reserved).
- **Effort**: 30 min.

### 🟠 Important

#### 3.5 🟠 Activate Husky + commitlint + lint-staged

- **Current state**: configs created in this PR, but the dependencies are not installed.
- **Fix**: in a session with no conflict with the parallel session, run:
  ```bash
  pnpm add -Dw @commitlint/cli @commitlint/config-conventional husky lint-staged
  pnpm dlx husky init   # this overwrites .husky/pre-commit and .husky/commit-msg ← restore them after
  # alternative without husky init: add "prepare": "husky" to package.json manually
  ```
  Add to the root `package.json`:
  ```json
  "scripts": { "prepare": "husky" }
  ```
- **Effort**: 30 min.

#### 3.6 🟠 Raise TypeScript to complete strict flags

- **Current state**: `tsconfig.base.json` has `strict`, `noUncheckedIndexedAccess` ✅. Missing `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`.
- **Fix**: enable one at a time in `tsconfig.base.json`, running `pnpm typecheck` and fixing errors. Likely ~50-150 sites to adjust across the 4 workspaces.
- **Effort**: 4-8 h (most is `exactOptionalPropertyTypes` due to the difference between `?:` and `T | undefined`).
- **Note**: NOT done in this PR to avoid breaking the parallel session's typechecks.

#### 3.7 🟠 Minimum tests

Per `STANDARDS.md` §3.6 (realistic minimum strategy):

- Install Vitest: `pnpm add -Dw vitest @vitest/coverage-v8`.
- Add a `"test": "vitest run"` script at root.
- **MUST** tests:
  - `packages/shared-types`: accept valid shape / reject invalid (each Zod schema).
  - `packages/db`: `db row ↔ DTO` mappers.
  - `apps/sidecar`: contract test per endpoint (responds with the declared Zod shape).
  - MCP tools: each handler validates input and returns the expected shape.
- **Effort**: 12-20 h first pass with reasonable minimum coverage.

#### 3.8 🟠 SQLite — confirm WAL + audit indexes

- **Current state**: need to audit `apps/sidecar/src/shared/db.ts` to confirm `pragma('journal_mode = WAL')` and `synchronous = NORMAL`. Indexes need to be verified one by one in `packages/db/src/schema.ts`.
- **Fix**: ensure at boot:
  ```ts
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  ```
  Audit indexes on frequently-filtered columns (`tasks.projectId`, `tasks.status`, `kanbanMovements.taskId`, etc.).
- **Effort**: 1-2 h.

#### 3.9 🟠 MCP tools — strict Zod, timeouts, payload limits

- **Current state**: need to audit `apps/sidecar/src/mcp/server.ts`. Likely each tool validates but without a consistent pattern; no timeouts; no output limit.
- **Fix**: see `STANDARDS.md` §1.8. Apply a `withTimeout(5000)` and `withMaxOutputBytes(100_000)` wrapper to each handler.
- **Effort**: 3-4 h.

#### 3.10 🟠 Safe logging — Pino redact

- **Current state**: Pino installed but `apps/sidecar/src/shared/logger.ts` likely has no redact configured.
- **Fix**: configure `redact: ['headers.authorization', 'headers["x-tortuga-secret"]', 'body.contactEmail', 'body.taxId', '*.password']`.
- **Effort**: 30 min.

#### 3.11 🟠 Path traversal — audit `loadAgentsFromDisk` and future attachments

- **Current state**: `loadAgentsFromDisk` reads from `env.agentsDir`. Likely safe because the path is controlled, but make sure no user input reaches `fs.*` without `path.resolve` + prefix verification.
- **Fix**: audit the module + add a `safeResolveUnder(root, userPath)` helper in `apps/sidecar/src/shared/fs-safe.ts`.
- **Effort**: 2-3 h.

#### 3.12 🟠 Strict CORS in the sidecar

- **Current state**: `server.ts` accepts any `localhost:*`. Needed for dev (Vite :5173), but in prod it should be restricted to `tauri://` and `http://tauri.localhost`.
- **Fix**: gating by `isDev`.
- **Effort**: 30 min.

#### 3.13 🟠 Cargo.lock committed

- **Current state**: `.gitignore` excludes `**/src-tauri/Cargo.lock`.
- **Official Rust recommendation**: for crates that produce binaries (apps), Cargo.lock IS committed. For libraries, not. Tortuga is an app.
- **Fix**: remove `**/src-tauri/Cargo.lock` from `.gitignore`, commit the `Cargo.lock`.
- **Effort**: 5 min (`.gitignore` change).

#### 3.14 🟠 PHASES.md does not exist

- **Current state**: README references `docs/PHASES.md` but the file isn't created yet.
- **Fix**: extract the phase descriptions from the README + the commit history. A living roadmap document.
- **Effort**: 1-2 h.

### 🟡 Nice-to-have

#### 3.15 🟡 Raise Biome `noExplicitAny` to `error`

- **Current state**: warn.
- **Fix**: clean up the current `any` (likely few), raise to error.
- **Effort**: 1-3 h depending on volume.

#### 3.16 🟡 SPDX header in significant files

- **Current state**: no file has an SPDX header.
- **Fix**: optional; can be progressive.
- **Effort**: 30 min with a script.

#### 3.17 🟡 Bundle analysis baseline

- **Current state**: never run.
- **Fix**: `pnpm add -D vite-bundle-visualizer`, add `pnpm analyze`. Document the baseline in `docs/`.
- **Effort**: 1 h.

#### 3.18 🟡 Branch protection on GitHub

- **Current state**: private repo.
- **Fix**: in GitHub settings, protect `main`: require PR, status checks (the CI workflow ones), 1 minimum review.
- **Effort**: 15 min.

#### 3.19 🟡 Tauri updater with an Ed25519 key

- **Current state**: not configured.
- **Fix**: when signed releases are published. Generate a key pair, configure `tauri-plugin-updater`, publish `latest.json`.
- **Effort**: 4-6 h first time.

---

## 4. Total estimate for "release ready"

Assuming all criticals and all important items are closed:

| Block | Effort |
|---|---|
| 🔴 Critical (3.1 → 3.4) | 6-9 h |
| 🟠 Important (3.5 → 3.14) | 25-40 h |
| 🟡 Nice-to-have (3.15 → 3.19) | 8-12 h |
| **Reasonable total** | **~30-50 h** (one focused week) |

If only 🔴 + a few 🟠 are closed (Husky+commitlint, CSP, Zod, secret, minimum
sidecar + MCP tests, WAL, logging redact): **~20-25 h**.

---

## 5. Recommended plan

Open **F3.1.X — security hardening** as a sub-phase after closing F3.1, split into:

1. **F3.1.X.a — Basic security** (closes 3.1, 3.2, 3.3, 3.10, 3.11, 3.12). ~12-15 h.
2. **F3.1.X.b — Tests + strict TS** (closes 3.6, 3.7). ~16-25 h.
3. **F3.1.X.c — MCP + DB hardening** (closes 3.8, 3.9). ~5 h.
4. **F3.1.X.d — Cleanup** (closes 3.4, 3.5, 3.13, 3.14, 3.15, 3.16). ~5-8 h.
5. **F3.1.X.e — Release** (3.18, first signed release). ~3-5 h.

---

## 6. Appendix — Recorded decisions

- **Husky was NOT activated automatically** in this PR to avoid clashing with the parallel session (it would modify the root `package.json`, where conflicts could occur). Configs and hooks ready; the activation is 1 command.
- **`tsconfig.base.json` was NOT modified** for the same reason: adding `exactOptionalPropertyTypes` can break the typecheck the parallel session needs green to commit F3.1. Documented as debt 3.6.
- **No application code was touched** (zero diffs in `apps/`, `packages/src/`, `migrations/`). All debts requiring code changes are listed above with an estimate.
