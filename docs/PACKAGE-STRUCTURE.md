# Tortuga OS — Package Structure (Proposal)

> Target architecture for the monorepo. Designed for reuse, clear ownership, and
> incremental scaling. Companion to [DOMAIN.md](./DOMAIN.md).
>
> Status: **proposal**. Implementation lands as a series of focused PRs, not a
> big bang. Each section below has an explicit migration cost so we can pick the
> order.

---

## Current state (post Phase B)

```
tortuga-os/
  apps/
    desktop/                 Tauri shell (Rust + WebView)
    sidecar/                 Hono HTTP server + MCP server (Node)
    web/                     React app served inside the Tauri WebView
  packages/
    db/                      Drizzle schema + SQLite client
    shared-types/            Wire-format DTOs and enums (framework-free)
```

Two packages. One TypeScript "domain" (DOMAIN.md) sprawled across every
sidecar module. No clean way to test domain rules without booting the sidecar.
No reusable building blocks for the desktop/web clients beyond DTOs.

---

## Target state

```
tortuga-os/
  apps/
    desktop/                 Tauri shell (Rust). Almost no logic; just hosts web.
    web/                     React UI. Imports @tortuga/ui + @tortuga/api-client.
    sidecar/                 HTTP + MCP servers. Thin glue over @tortuga/core.
    mcp-standalone/          (optional) Same MCP tools, run outside Tauri.

  packages/
    contracts/               Single source of truth: DTOs, enums, error codes,
                             zod schemas for HTTP/MCP payloads. Replaces
                             shared-types.
    domain/                  Pure domain types + invariants + state machines
                             (Phase transitions, Quote lifecycle, Task workflow,
                             Rework imputation). Zero IO; pure functions and
                             types only. The orchestrator brain.
    core/                    Application use-cases (createProject, approveQuote,
                             approveTask, logWorkEntry, getProjectCostReport).
                             Depends on @tortuga/domain and on a Storage port.
                             Framework-free.
    storage-sqlite/          Drizzle implementation of the Storage port.
                             Replaces db/. Exposes a Storage that core/ consumes.
    api-server/              Hono routers + middleware + handshake/CORS gating.
                             Pure HTTP transport over @tortuga/core. Replaces
                             sidecar/src/server.ts and modules/*/routes.ts.
    mcp-server/              MCP transport over @tortuga/core. Replaces
                             sidecar/src/mcp/server.ts.
    api-client/              Type-safe HTTP client generated against the Hono
                             routes (uses Hono's RPC types + zod from contracts).
                             Consumed by apps/web and apps/desktop.
    ui/                      React component library with the tokens from the
                             Tortuga OS brandbook. Pure presentational components.
    ui-flows/                Higher-order React components that bind UI to
                             domain flows (Quote editor, Story editor, Gate
                             checklist, Cost report viewer). Imports ui +
                             api-client + contracts.
    fs-workspace/            On-disk workspace primitive (scaffold, tree, file
                             read, safe paths). Replaces modules/workspace/.
                             Reusable from both api-server and CLI tools.
    runners-shell/           Subprocess runners for gates (flutter analyze,
                             build, smoke tests). Replaces modules/preview/
                             app-launcher + runners/. Reusable from tests.
    config/                  Env loader + secrets (with a Vault adapter once we
                             have one).
    test-fixtures/           Factories for entities (Project, Quote, Story,
                             Task, Iteration, ReworkTicket) used across all
                             package tests. Replaces seed/synthetic.ts.
    eslint-config/           Shared linting rules + commitlint config.
    tsconfig/                Shared tsconfig.base.json + per-target presets
                             (node, browser, library).
```

---

## Dependency rules (the only architecture that matters)

```
                    apps/desktop ─┐
                                 ▼
                    apps/web ── @tortuga/ui-flows
                                 ▲
                                 │
                       @tortuga/api-client
                                 ▲
                                 │           apps/sidecar
                       @tortuga/contracts ◀──── @tortuga/api-server ─┐
                                 ▲                                   ▼
                                 │                          @tortuga/mcp-server
                       @tortuga/core ◀───────── @tortuga/storage-sqlite
                                 ▲                                   ▲
                                 │                                   │
                       @tortuga/domain                  @tortuga/fs-workspace
                                                       @tortuga/runners-shell
```

Hard rules:

1. **`domain` depends on nothing.** No filesystem, no DB, no HTTP. Pure types
   and functions. If you can't test it with `pnpm test` in 200 ms, it's wrong.
2. **`core` depends on `domain` and on Storage *ports*, never on
   implementations.** This is why `core` can be reused by an MCP server, a CLI
   or a serverless function without dragging SQLite.
3. **Transport (`api-server`, `mcp-server`) imports `core` and `contracts`,
   never the other transport.** They are peers, not nested.
4. **Frontends (`web`, `desktop`) import `api-client`, `ui`, `ui-flows`,
   `contracts`. They never import `core` or `domain` directly.**
5. **`contracts` is the boundary.** It carries DTOs, enums, and HTTP/MCP schemas
   exactly once. Anything inside `domain`/`core` that crosses the wire goes
   through a contract.

Violations of these rules will be caught by an ESLint rule
(`eslint-config/no-restricted-imports`) baked into `@tortuga/eslint-config`.

---

## What each package owns (concretely)

### `@tortuga/contracts`
- Today: this is `packages/shared-types/`. Renamed and slightly expanded.
- Adds: zod schemas for every HTTP body and MCP tool input. The schemas live
  here so `api-server` validates and `api-client` types from a single source.
- Adds: stable error codes (`project_code_conflict`, `quote_not_editable`,
  `iteration_task_mismatch`, …) as a typed enum so clients can switch on them.

### `@tortuga/domain`
- New. Currently the domain logic is split across `modules/*/use-cases.ts` mixed
  with DB calls.
- Owns: the state machines.
  - `Phase`: `pending → in_progress → approved | rejected | rework`.
  - `Quote`: `draft → sent → (changes_requested ⟶ new version) | approved | rejected`.
  - `Task`: `pending → in_progress → qa → approved | rework → in_progress`.
  - `Iteration`: open → closed with outcome.
- Owns: the *invariants* (one Phase per type per project, F1 must approve
  before F2 opens, Story acceptance criteria required before Quote.approve,
  ReworkTicket weights sum to 1.0).
- Owns: the **rework imputation algorithm** (REWORK-MODEL.md) as a pure
  function: `imputeReworkCost(workEntries, reworkTickets, rates) → PhaseBreakdown`.

### `@tortuga/core`
- New. Use-cases live here.
- Defines a `Storage` port (interface) with methods named by domain action,
  not SQL operation: `createProjectWithSalesPhase`, `loadCurrentQuote`,
  `appendIteration`, `logWorkEntry`, etc.
- Imports `domain` for state-machine guards.
- Each use-case is a pure function `(input, storage) → Promise<output>`. Easy
  to unit-test with a fake `Storage`.

### `@tortuga/storage-sqlite`
- Today: this is `packages/db/`.
- Renamed and reshaped: instead of exposing the raw Drizzle client, exposes a
  `SqliteStorage` that implements the `Storage` port from `core`.
- Migrations stay here. The Drizzle schema stays here.
- Apps that need a *different* persistence (in-memory tests, Postgres in the
  future) implement a new package without touching `core` or `domain`.

### `@tortuga/api-server`
- New. Today this lives in `apps/sidecar/src/server.ts` and
  `apps/sidecar/src/modules/*/routes.ts`.
- Owns: Hono routers, middleware (CORS, handshake, body size), error mapping.
- Each route is a thin adapter: validates body via contracts, calls a core
  use-case, maps result/errors to JSON.
- Can be embedded into any Node app (sidecar, ServerlessExpress, etc.).

### `@tortuga/mcp-server`
- New. Today this lives in `apps/sidecar/src/mcp/server.ts`.
- Same role as `api-server` but over MCP/stdio.
- Imports `core` directly; no HTTP loop required.
- Lets us ship a standalone MCP binary (`apps/mcp-standalone`) that doesn't
  pull in Hono.

### `@tortuga/api-client`
- New. The frontend currently uses ad-hoc `fetch`.
- Generated from Hono's RPC types. `client.api.quotes.$post({ json: {...} })`
  is fully typed against the route definitions.
- Single export consumed by `apps/web` and any future frontend.

### `@tortuga/ui`
- New. Today the design system is sprinkled inside `apps/web/src/components/`.
- Pure presentational components tied to brand tokens (memory:
  reference_brand_visual). Storybook lives here if we add it.
- No data fetching, no router awareness.

### `@tortuga/ui-flows`
- New. Higher-order components: `<QuoteEditor projectCode="…" />`,
  `<TaskBoard storyId="…" />`, `<CostReport projectCode="…" />`.
- These wire `ui` to `api-client` and to React Query (or whatever client-side
  state we standardize on).
- The apps (`web`, `desktop`) compose these into pages. No more "flow logic
  buried inside a page component".

### `@tortuga/fs-workspace`
- Today: `apps/sidecar/src/modules/workspace/use-cases.ts`.
- Extracted so a CLI tool (e.g. `tortuga scaffold <code>`) can use it without
  starting the sidecar.

### `@tortuga/runners-shell`
- New. Today: bits scattered across `apps/sidecar/src/modules/preview/` and
  `runners/`.
- Subprocess runners: `flutter analyze`, `flutter build`, `flutter run`,
  shell-out templates for arbitrary gate commands. Returns structured results
  the orchestrator can record via `recordGateOutcome`.

### `@tortuga/config`
- New. `apps/sidecar/src/shared/env.ts` lives here.
- Adds a Secrets port + an env-var-backed adapter. When we re-introduce the
  secrets module in Phase C, it implements this port (against SQLite or against
  the OS keychain).

### `@tortuga/test-fixtures`
- New. Factories: `aProject({...overrides})`, `aQuote({...})`, etc.
- Replaces the deleted `seed/synthetic.ts` for tests; for first-run dev seeding
  we add a tiny CLI later.

### `@tortuga/eslint-config` and `@tortuga/tsconfig`
- New. Today every app has its own duplicated tsconfig and lint rules.
- Centralizes "node-server preset", "browser preset", "library preset".

---

## Migration plan (small, sequenced steps)

Each step lands as a single PR, each leaves the typecheck green.

| # | Step | Cost | Risk |
|---|---|---|---|
| 1 | Rename `shared-types` → `contracts`. Add zod schemas (move them out of `modules/**/use-cases.ts`). | 2-3h | Low |
| 2 | Create `tsconfig` package; switch all apps/packages to extend it. | 1-2h | Low |
| 3 | Create `eslint-config` package; add no-restricted-imports rules. | 2-3h | Low (catches future drift) |
| 4 | Create `domain` package. Extract state-machine guards from current `use-cases.ts` into pure functions. Add unit tests. | 1 day | Low |
| 5 | Create `core` package + define `Storage` port. Move use-cases from `apps/sidecar/src/modules/**/use-cases.ts` to `core/`. Drop the `getDb()` direct call; the use-case takes a `Storage` arg. | 2 days | Medium (touches everything) |
| 6 | Rename `db` → `storage-sqlite`. Implement the `Storage` port over Drizzle. | 1 day | Medium |
| 7 | Extract `fs-workspace`. | 0.5 day | Low |
| 8 | Extract `runners-shell` (currently nearly empty after Phase B; small now is good). | 0.5 day | Low |
| 9 | Extract `api-server`. `apps/sidecar` shrinks to a wrapper that imports `api-server` + `mcp-server` + boots both. | 1 day | Medium |
| 10 | Extract `mcp-server`. | 0.5 day | Low |
| 11 | Create `api-client` from Hono RPC types. Replace ad-hoc fetch in `apps/web`. | 1 day | Medium |
| 12 | Extract `ui` and `ui-flows` from `apps/web`. | 2 days | Medium (UI moves) |
| 13 | Create `test-fixtures`. Adopt across `domain`, `core`, `storage-sqlite` tests. | 0.5 day | Low |

Total scope: ~12 working days when no other work is interleaved. The first 3
steps unblock the rest with little risk and can land back-to-back.

---

## What changes in day-to-day work

- **Adding a new use-case**: write it in `core/` with input/output types from
  `contracts/`. Add a fake-Storage unit test. Wire it to a Hono route in
  `api-server/` and an MCP tool in `mcp-server/`. Frontend picks it up
  automatically through `api-client`.
- **Changing a state-machine rule**: edit `domain/`. Tests in `domain/` and
  `core/` catch regressions before either transport sees them.
- **Switching DB**: implement a new `Storage` impl. Zero churn in `core`,
  `domain`, transports, or UI.
- **Building a CLI** (e.g., `tortuga scaffold`): import `core` + a `Storage`
  impl directly. No HTTP, no MCP. Same domain rules.

---

## Locked decisions

These were open questions in earlier drafts; they are now part of the contract.

1. **Desktop and web render the same React bundle.** `apps/desktop` is a Tauri
   shell that loads the bundle produced by `apps/web`. There is exactly one UI
   to maintain. Tauri adds only what only Tauri can give: auto-update, native
   menus, OS file dialogs, system-tray, multi-window. Any UI feature that
   doesn't need those lives in `apps/web` and ships to both.
2. **Public packages use the `@tortuga-os/*` scope** (Tortuga OS ships under
   BUSL-1.1, converts to Apache 2.0 on 2030-05-28). The following are
   publishable as `@tortuga-os/*`: `contracts`,
   `domain`, `core`, `storage-sqlite`, `api-server`, `mcp-server`,
   `api-client`, `ui`, `ui-flows`, `fs-workspace`, `runners-shell`, `config`,
   `eslint-config`, `tsconfig`. The internal-only packages stay unscoped or
   under the private `@tortuga-os-internal/*` scope: `test-fixtures`, plus
   every app under `apps/*` (which is never published).
3. **Tauri is the desktop strategy.** `apps/desktop` is the only package that
   imports Tauri APIs. If we ever evaluate alternatives, only that one package
   changes; nothing in `domain`, `core`, transports or UI knows Tauri exists.

## Next step

Step 1, 2 and 3 (rename `shared-types` → `@tortuga-os/contracts`, create
`@tortuga-os/tsconfig`, create `@tortuga-os/eslint-config`) land first. They
unblock the rest with the lowest risk.
