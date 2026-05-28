# Contributing to Tortuga OS

Thanks for taking the time to contribute. This document is the **binding** set of rules for any change that lands in `main`. It is short on purpose — read it once, refer back when in doubt.

> License note: Tortuga OS ships under **Business Source License 1.1** (converts to Apache 2.0 on 2030-05-28). By contributing you agree your changes are licensed under the same terms.

## 1. Quick start

```bash
# 1. Prereqs (one-time)
node --version       # >= 22
pnpm --version       # 10.x
rustup target add x86_64-pc-windows-msvc   # only if you build the desktop bundle

# 2. Install
pnpm install

# 3. Dev: Tauri shell + sidecar + web vite
pnpm tauri dev
```

The dev SQLite lives at `data/dev/tortuga.db`. It is **never** committed. Migrations apply on sidecar boot via Drizzle.

## 2. Branch model

`main` is the only long-lived branch. Everything else is short-lived, opened from `main`, merged via PR (squash), and deleted.

Branch names:

| Type | Format | Example |
|---|---|---|
| Feature | `feat/<short-slug>` | `feat/troubleshooter-mcp-supabase` |
| Bugfix | `fix/<short-slug>` | `fix/scrcpy-keyframe-loss` |
| Refactor | `refactor/<short-slug>` | `refactor/agent-runner-port` |
| Chore (deps, infra) | `chore/<short-slug>` | `chore/bump-tauri-2.2` |
| Docs | `docs/<short-slug>` | `docs/standards-update` |

No more `release/X.Y.Z` long-running branches. Release = tag from `main`.

## 3. Commit convention

We use Conventional Commits, enforced by commitlint + husky. Format:

```
<type>(<scope>): <short imperative summary>

<optional body>

<optional footer>
```

Allowed `<type>` values (see `commitlint.config.cjs`): `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`, `build`, `ci`, `revert`.

Examples:

```
feat(troubleshooter): apply SQL migrations via Supabase MCP
fix(scrcpy): suppress false FAILED on legitimate Read content
chore(deps): bump @tauri-apps/api to 2.1.1
docs(standards): document zero-comment policy
```

No `Co-Authored-By` lines. No tool signatures. The committer is the author.

## 4. PRs

Open a PR against `main`. The PR template (`.github/pull_request_template.md`) is mandatory — fill every section.

What `main` requires before merging:

- ✅ CI green (typecheck monorepo + biome + sidecar bundle build)
- ✅ Self-review of the diff (no leftover `console.log`, no TODOs without an issue link, no `--no-verify` commits)
- ✅ For UI changes: a screenshot in the PR body
- ✅ For DB changes: the Drizzle migration applied locally and the schema diff reviewed
- ✅ For `breaking` PRs (see §6): explicit reviewer approval

Merge style: **squash and merge**. The squash commit message becomes the entry in `main`'s linear history.

## 5. Code standards

The full standards live in [`docs/STANDARDS.md`](docs/STANDARDS.md) (binding). Highlights:

- **English everywhere** — code, identifiers, comments, commit messages. User-facing strings in Spanish only inside the `apps/web` UI.
- **Zero comments by default.** A comment is allowed only when the *why* is non-obvious (a hidden constraint, a workaround, an invariant). Never write *what* the code does — that is what naming is for.
- **SOLID + framework idioms.** No premature abstractions. Three similar lines beat a wrong abstraction.
- **No tests by default during alpha.** Add tests when explicitly asked, or when fixing a bug that should never regress.
- **Boundaries between packages are enforced by dependency-cruiser** (`pnpm boundaries`). Don't cross them.

## 6. Breaking changes

A change is **breaking** if it does any of these:

- Removes or renames a column in `packages/storage-sqlite/src/schema.ts`
- Removes or renames a member of any `domain/values.ts` enum
- Removes or changes the shape of an exported DTO in `packages/contracts`
- Changes the wire shape of an existing HTTP endpoint
- Changes the IPC contract between Tauri shell and the sidecar
- Drops support for a Node / pnpm / Rust version we currently target

For these:

1. Open the PR with the `breaking` label.
2. The PR description **must** include a "Migration" section explaining the impact + how downstream code adapts.
3. Wait for an explicit ✅ from a CODEOWNER before merging.

If you *add* (column, enum member, DTO field), that's NOT breaking — go ahead.

## 7. DB migrations (Drizzle)

```bash
# 1. Edit packages/storage-sqlite/src/schema.ts
# 2. Generate the migration
pnpm db:generate
# 3. Apply locally (dev DB)
pnpm db:migrate
# 4. Verify the .sql under packages/storage-sqlite/migrations/ is what you expect
```

Migrations are **append-only**. Never edit a migration that already shipped. If you got it wrong, write a new migration that fixes it.

The sidecar's `build:dev` re-syncs the bundled migrations folder automatically when source counts change — no manual copy needed.

## 8. What `main` will reject

- A PR that bypasses commitlint or husky (`--no-verify`) without prior agreement.
- A PR that disables a CI check ("flaky", "temporary") without a tracking issue.
- A PR that introduces a `// TODO:` without a linked issue.
- A PR that adds dependencies without justifying them in the PR body.
- A PR that touches `LICENSE`, `package.json#license`, or copyright headers without an explicit approval.

## 9. Where to ask

- Architecture or scope questions: open a `discussion`-flavored issue.
- Reproducible bug: open a `bug` issue with steps to reproduce.
- Feature proposal: open a `feature` issue with the problem statement first; the solution comes after.
