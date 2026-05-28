# Tortuga OS — Security checklist

> Binding list. The `security-reviewer` subagent (see
> `docs/agents/security-reviewer.md`) applies it before merging each PR.
> Current state marked as of **2026-05-09** on `main` with the `feat(security)/*`
> session commits applied.

Legend: ✅ pass · 🟡 partial · ❌ fail · 🔒 N/A justified.

## 1. Input boundaries

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.1 | Each HTTP endpoint uses `readBody`/`readParam`/`readQuery` from `shared/validate.ts` | ✅ | `apps/sidecar/src/modules/*/routes.ts` |
| 1.2 | Each MCP tool has `inputSchema: z.object(...)` (never `z.any`) | ✅ | `apps/sidecar/src/mcp/server.ts` |
| 1.3 | ZodError → 400 (not 500) in `errorHandler` | ✅ | `apps/sidecar/src/shared/errors.ts` |
| 1.4 | Body size capped (1 MiB) | ✅ | `MAX_BODY_BYTES` in `shared/validate.ts` |
| 1.5 | MCP output capped (1 MiB) and 30 s timeout | ✅ | `MAX_OUTPUT_BYTES` and `withTimeout` in `mcp/server.ts` |
| 1.6 | Schemas with `.strict()` on patches and sensitive POSTs | 🟡 | `PatchTaskInput`, `PatchTimeEntryInput`, `StartRunBody`, `AutoModeBody`, `SetStatusBody` already. Some `Create*` still need `.strict()` (low). |

## 2. Local authn / authz

| # | Item | Status | Evidence |
|---|---|---|---|
| 2.1 | Sidecar binds exclusively to `127.0.0.1` | ✅ | `apps/sidecar/src/main.ts` |
| 2.2 | Handshake nonce injected by the shell, required on `/api/*` | ✅ | `apps/desktop/src-tauri/src/sidecar.rs` + `apps/sidecar/src/shared/handshake.ts` |
| 2.3 | Nonce ≥ 16 chars and CSPRNG entropy | ✅ | UUIDv4 = 122 bits, validated in `handshake.ts::readSecretFromEnv` |
| 2.4 | Constant-time comparison of the nonce | ✅ | `safeEqual` in `handshake.ts` |
| 2.5 | Nonce never logged or persisted | ✅ | `SidecarState.secret` in memory only; logger redacts `x-tortuga-secret` |
| 2.6 | SSE accepts `?token=` only on `/stream` paths | ✅ | `requireHandshake` |
| 2.7 | `/health` without handshake (liveness) | ✅ | `server.ts` mounts `/health` before `app.use('/api/*', requireHandshake)` |

## 3. WebView hardening

| # | Item | Status | Evidence |
|---|---|---|---|
| 3.1 | CSP defined (not `null`) | ✅ | `tauri.conf.json` |
| 3.2 | `script-src` without `'unsafe-inline'` or `'unsafe-eval'` | ✅ | only `'self' 'wasm-unsafe-eval'` (+ Vite dev) |
| 3.3 | `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'none'` | ✅ | `tauri.conf.json` |
| 3.4 | `connect-src` limited to self + sidecar | ✅ | `tauri.conf.json` |
| 3.5 | `dangerouslySetInnerHTML` only with a documented sanitizer | ✅ | `renderMarkdown` with `escapeHtml` |
| 3.6 | Minimal Tauri capabilities | ✅ | `capabilities/default.json` only exposes `core:*` and `log:default` |

## 4. Filesystem

| # | Item | Status | Evidence |
|---|---|---|---|
| 4.1 | `safeResolveUnder(root, userPath)` helper available | ✅ | `apps/sidecar/src/shared/fs-safe.ts` |
| 4.2 | `loadAgentsFromDisk` uses `safeResolveUnder` | ✅ | `apps/sidecar/src/modules/agents/loader.ts` |
| 4.3 | No `fs.readFile/writeFile/unlink` with a path derived from HTTP/MCP input | ✅ | grep clean |
| 4.4 | `data/` in `.gitignore` | ✅ | `.gitignore` |
| 4.5 | SQLite DB in `app_data_dir()` (Windows: `%APPDATA%\Tortuga-OS`) | ✅ | `apps/desktop/src-tauri/src/sidecar.rs::resolve_data_dir` |

## 5. SQLite

| # | Item | Status | Evidence |
|---|---|---|---|
| 5.1 | WAL enabled | ✅ | `packages/db/src/client.ts` |
| 5.2 | `foreign_keys = ON` | ✅ | idem |
| 5.3 | `synchronous = NORMAL` | ✅ | idem |
| 5.4 | Queries via Drizzle (no string interpolation) | ✅ | grep `db.run.*\${` clean |
| 5.5 | Idempotent migrations with drizzle-kit | ✅ | `packages/db/migrations/` |

## 6. Child processes

| # | Item | Status | Evidence |
|---|---|---|---|
| 6.1 | `child_process.spawn` with args as an array (not a string) | ✅ | `apps/sidecar/src/modules/agent-runs/runner.ts` |
| 6.2 | `command` not derived from external input | ✅ | hardcoded to `'claude'` or a stub for tests |
| 6.3 | `cwd` validated against the configured `repoPaths` (not arbitrary input) | ✅ | `resolveCwd` |
| 6.4 | `shell: true` only on Windows with sanitized args | 🟡 | the agent `system_prompt` comes from `packages/agents/*.md` (controlled), not from external input. Defense in depth: pass `--system-prompt` via stdin instead of an arg in a future iteration. |

## 7. Logging

| # | Item | Status | Evidence |
|---|---|---|---|
| 7.1 | Pino `redact` configured | ✅ | `apps/sidecar/src/shared/logger.ts` |
| 7.2 | Sensitive headers in redact (`authorization`, `x-tortuga-secret`, `cookie`) | ✅ | idem |
| 7.3 | Sensitive bodies in redact (`password`, `token`, `apiKey`, `contactEmail`, `taxId`) | ✅ | idem |
| 7.4 | Secret env vars in redact | ✅ | idem |
| 7.5 | Logs never include the full request body | ✅ | nobody logs `req.body` directly |

## 8. CORS

| # | Item | Status | Evidence |
|---|---|---|---|
| 8.1 | `tauri://*` always allowed | ✅ | `apps/sidecar/src/server.ts::isAllowedOrigin` |
| 8.2 | `http://localhost:*` allowed only when `env.isDev` | ✅ | idem |
| 8.3 | Other origins rejected | ✅ | idem |
| 8.4 | `allowHeaders` includes `x-tortuga-secret` | ✅ | idem |

## 9. Dependencies

| # | Item | Status | Evidence |
|---|---|---|---|
| 9.1 | `pnpm audit --audit-level=high` in CI | ✅ | `.github/workflows/ci.yml` and `security.yml` |
| 9.2 | Dependabot enabled (npm + cargo + actions) | ✅ | `.github/dependabot.yml` |
| 9.3 | Lockfile committed (`pnpm-lock.yaml`) | ✅ | repo |
| 9.4 | License compliance check (no GPL/AGPL/SSPL) | ✅ | `security.yml` |
| 9.5 | `Cargo.lock` committed | ❌ | `.gitignore` excludes it. Debt 🟠 (audit 3.13). |

## 10. CI / Tooling

| # | Item | Status | Evidence |
|---|---|---|---|
| 10.1 | gitleaks | ✅ | `ci.yml` + `security.yml` |
| 10.2 | Semgrep (OWASP / TS / JS / secrets) | ✅ | `security.yml` |
| 10.3 | CodeQL | ✅ | `security.yml` (push + schedule) |
| 10.4 | Husky + commitlint + lint-staged active | 🟡 | configs created, deps not installed (debt 3.5) |

## 11. License & docs

| # | Item | Status | Evidence |
|---|---|---|---|
| 11.1 | LICENSE (proprietary, all rights reserved) | ✅ | `LICENSE` |
| 11.2 | SECURITY.md | ✅ | `SECURITY.md` |
| 11.3 | THREAT_MODEL.md (STRIDE) | ✅ | `docs/THREAT_MODEL.md` |
| 11.4 | SECURITY_AUDIT_FINDINGS.md (live) | ✅ | `docs/SECURITY_AUDIT_FINDINGS.md` |

## 12. Releases and supply chain (future)

| # | Item | Status | Evidence |
|---|---|---|---|
| 12.1 | Tauri updater Ed25519 | 🔒 N/A | no signed releases yet (debt 3.20) |
| 12.2 | Documented reproducible builds | 🔒 N/A | F4 |
| 12.3 | SBOM (CycloneDX) in releases | 🔒 N/A | F4 |
| 12.4 | Branch protection on main | 🔒 N/A | private repo (debt 3.18) |

---

## How this checklist is updated

- Every PR that touches security must update the **Status** column of the
  affected item.
- The `security-reviewer` agent reads this table as input.
- Any item in ❌ blocks a release.
