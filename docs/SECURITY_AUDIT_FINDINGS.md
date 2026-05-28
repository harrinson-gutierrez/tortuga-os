# Tortuga OS — Security audit findings

> Living document. Each finding has a severity, file:line (where applicable), a
> description, the applied or pending fix, and the commit that closes it.

Initial audit: **2026-05-09**, over base commit `dda499c`. Hardening pass after
the `feat(security)/*` session.

Severities:
- **CRITICAL** — blocking for release.
- **HIGH** — should be closed before the first release.
- **MEDIUM** — close in the next sub-phase.
- **LOW** — annotation / quality.

## Findings closed in this session

### F-001 · CRITICAL · null CSP in `tauri.conf.json`

- **File**: `apps/desktop/src-tauri/tauri.conf.json:27` (before)
- **Description**: `"security": { "csp": null }`. WebView fully open to XSS / external content injection.
- **Fix**: strict CSP with `default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'` (+ Vite HMR in dev), `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'none'`, `connect-src` limited to the local sidecar.
- **Status**: ✅ closed in commit `feat(security): strict CSP in tauri.conf.json`.

### F-002 · CRITICAL · Zod validation missing on HTTP endpoints

- **Files**: `apps/sidecar/src/modules/*/routes.ts` (all modules)
- **Description**: Each handler did `await c.req.json()` and passed it straight to the use-case. Validation was implicit; a ZodError inside caused a 500 (not 400) via an `errorHandler` that did not handle `ZodError`.
- **Fix**:
  - `readBody`/`readQuery`/`readParam` helpers in `apps/sidecar/src/shared/validate.ts` that parse with Zod and throw `ValidationError` (400) with a clear message.
  - `errorHandler` now also maps an unwrapped `ZodError` to 400, as defense in depth.
  - Applied to the 13 routers (projects, sprints, tasks, time-entries, milestones, clients, people, agents, agent-runs, kanban, leads, inbox, admin).
  - Body size capped at 1 MiB (`MAX_BODY_BYTES`).
- **Status**: ✅ closed in commit `feat(security): Zod validation on all sidecar HTTP endpoints`.

### F-003 · CRITICAL · No handshake secret between the Tauri shell and the sidecar

- **Files**: `apps/sidecar/src/server.ts`, `apps/desktop/src-tauri/src/sidecar.rs`, `apps/web/src/lib/api.ts`
- **Description**: The sidecar accepted any request to `127.0.0.1:<port>`. Any local process could read/modify the DB.
- **Fix**:
  - The Rust shell generates a UUIDv4 when spawning, passes it to the sidecar via the env var `TORTUGA_SIDECAR_SECRET`. The nonce stays in `SidecarState.secret` in memory.
  - Tauri command `get_sidecar_secret` returns the nonce to the WebView.
  - Sidecar middleware `requireHandshake` (in `apps/sidecar/src/shared/handshake.ts`) requires the header `x-tortuga-secret` on `/api/*`. `/health` is exempt.
  - Constant-time comparison of the nonce.
  - SSE `/stream` accepts `?token=` as a fallback because `EventSource` does not allow custom headers.
  - The web client in `apps/web/src/lib/api.ts` adds the header automatically; SSE builds the URL with the token.
  - The nonce is never logged, never persisted, is regenerated on every boot, and is cleared from state on kill.
- **Status**: ✅ closed in commit `feat(security): handshake token between the Tauri shell and the sidecar`.

### F-004 · CRITICAL · `LICENSE` does not exist

- **File**: repo root
- **Description**: README said "all rights reserved". Without a LICENSE the legal status is unclear.
- **Fix**: `LICENSE` with a short proprietary "all rights reserved" notice.
- **Status**: ✅ closed.

### F-005 · HIGH · Pino without redaction

- **File**: `apps/sidecar/src/shared/logger.ts`
- **Description**: The global logger did not apply `redact`. Any `logger.info({ headers: req.headers })` would leak the `x-tortuga-secret`.
- **Fix**: `redact: { paths: [...], censor: '[REDACTED]' }` covering authorization, cookie, x-tortuga-secret, password, token, apiKey, contactEmail, taxId, email, phone, and sensitive env vars.
- **Status**: ✅ closed in commit `feat(security): pino redact, CORS gating, path traversal guards, MCP timeouts, SQLite WAL`.

### F-006 · HIGH · CORS too permissive

- **File**: `apps/sidecar/src/server.ts`
- **Description**: Accepted any `http://localhost:*` and `http://127.0.0.1:*` in production. In prod there should be no legitimate browser pointing at the sidecar.
- **Fix**: `isAllowedOrigin` helper gated by `env.isDev`. In prod only `tauri://*` / `http://tauri.localhost`. Origin `null` allowed (the Tauri webview sometimes does not send Origin) — the handshake middleware remains the real barrier.
- **Status**: ✅ closed in the same commit as F-005.

### F-007 · HIGH · ZodError → 500 (not 400) in `errorHandler`

- **File**: `apps/sidecar/src/shared/errors.ts`
- **Description**: The general handler did not recognize `ZodError`, returning 500 + the error message with internal schema details.
- **Fix**: `instanceof ZodError → 400` branch with readable paths. The message for `INTERNAL` errors is also sanitized so stack traces are not exposed to the client.
- **Status**: ✅ closed in the Zod validation commit.

### F-008 · MEDIUM · MCP tools without timeout or payload limit

- **File**: `apps/sidecar/src/mcp/server.ts`
- **Description**: A tool could hang the MCP client (slow SQLite operation or a bug in a use-case). Unbounded output saturated the client's context.
- **Fix**: `withTimeout(30 s)` + `MAX_OUTPUT_BYTES = 1 MiB`.
- **Status**: ✅ closed in the hardening commit.

### F-009 · MEDIUM · Path traversal in the agents loader

- **File**: `apps/sidecar/src/modules/agents/loader.ts`
- **Description**: `join(dir, file)` without verifying that `file` does not contain `..`. `readdir` almost never returns malicious names but defense in depth.
- **Fix**: `safeResolveUnder(dir, file)` with a prefix check. Generic helper in `apps/sidecar/src/shared/fs-safe.ts`.
- **Status**: ✅ closed in the hardening commit.

### F-010 · LOW · Internal error message exposing details

- **File**: `apps/sidecar/src/shared/errors.ts`
- **Description**: The `errorHandler` returned `err.message` for 500. Runtime details (stack/message) exposed to the client.
- **Fix**: 500 now returns a constant `{ error: { code: 'INTERNAL', message: 'Internal Server Error' } }`. Details remain only in the sidecar log.
- **Status**: ✅ closed in the Zod validation commit.

## PENDING findings (not resolved in this session)

### F-101 · MEDIUM · No automated tests

- **Description**: The repo had no Vitest installed. Zero coverage.
- **Estimated effort**: 12-20 h first pass.
- **Recommendation**: Vitest contract tests per Hono + Zod endpoint; DB↔DTO mappers; MCP handlers.
- **Tracking**: debt 3.7 in `STANDARDS_AUDIT.md`.

### F-102 · MEDIUM · Incomplete TypeScript strict flags

- **Description**: Missing `exactOptionalPropertyTypes`, `noImplicitOverride`, `noImplicitReturns`.
- **Effort**: 4-8 h (mostly `exactOptionalPropertyTypes`).
- **Tracking**: debt 3.6.

### F-103 · MEDIUM · Cargo.lock not committed

- **Description**: `.gitignore` excludes `**/src-tauri/Cargo.lock`. For binary apps committing it is recommended (drift between machines).
- **Effort**: 5 min.
- **Tracking**: debt 3.13.

### F-104 · MEDIUM · Husky / commitlint / lint-staged not activated

- **Description**: configs created, deps not installed.
- **Effort**: 30 min.
- **Tracking**: debt 3.5.

### F-105 · MEDIUM · `dangerouslySetInnerHTML` with a custom sanitizer

- **File**: `apps/web/src/overlays/TaskDetailOverlay.tsx:164` + `apps/web/src/lib/markdown.ts`
- **Description**: The sanitizer is custom and simple (escapes `<>&"'`). It works today but migrating to `react-markdown + rehype-sanitize` reduces the surface and avoids re-implementing known rules.
- **Effort**: 2-3 h.
- **Recommendation**: F4 when tables/links/images are needed in descriptions.

### F-106 · LOW · `child_process.spawn` with `shell: true` on Windows

- **File**: `apps/sidecar/src/modules/agent-runs/runner.ts:179`
- **Description**: `shell: true` only on Windows because `claude.cmd` requires it. The args include the agent `system_prompt`, which comes from controlled `.md` files. Low risk but passing the system prompt via stdin (there is already `child.stdin.write(initialPrompt)`) instead of a `--system-prompt arg` would reduce the surface.
- **Effort**: 1 h (refactor the Claude CLI invoke).

### F-107 · LOW · Universal audit log for CRUD

- **Description**: Today `kanbanMovements` records moves and `agentRuns` records runs. Other CRUDs (clients, tasks, milestones) have no audit log. Not needed for single-user use but useful if there are ever multiple maintainers.
- **Effort**: 4-6 h.

### F-108 · LOW · SQLite DB at-rest unencrypted

- **Description**: `tortuga.db` is stored in clear in `%APPDATA%`. Acceptable for single-user with OS login. For shared or portable use sqlcipher would be desirable.
- **Effort**: 4-8 h.

### F-109 · LOW · Zod schemas without `.strict()` on some `Create*`

- **Description**: `CreateProjectInput`, `CreateClientInput`, etc. do not have `.strict()`. That allows extra fields that are silently ignored. No vulnerability but it helps catch client bugs early.
- **Effort**: 30 min.

### F-110 · LOW · Hard timeout per agent run

- **Description**: An agent run that hangs (Claude CLI not responding) can run indefinitely. Today it's cancelled manually. A configurable timeout (e.g. 15 min) would kill orphan processes.
- **Effort**: 1 h.

---

## Global status

- **CRITICAL closed**: 4 / 4 (F-001..F-004).
- **CRITICAL pending**: 0.
- **HIGH closed**: 3 / 3 (F-005, F-006, F-007).
- **HIGH pending**: 0.
- **MEDIUM closed**: 3 (F-008, F-009, F-010).
- **MEDIUM pending**: 5 (F-101..F-105).
- **LOW pending**: 5 (F-106..F-110).

The CRITICALs and HIGHs are closed. The remaining MEDIUM/LOW items are
incremental and do not block ongoing work.
