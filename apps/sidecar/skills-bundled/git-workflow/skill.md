# Skill — Git Workflow

**Activate when**: agent role is `senior-dev`, OR any task that commits
code.

Clean, professional Git practice for 2026. History is documentation;
treat every commit as something a teammate will read in a year.

## HARD RULE — no AI attribution in commits

**NEVER add `Co-Authored-By` trailers, `Generated with Claude`,
`🤖 Generated with...`, or any AI/assistant attribution or signature to a
commit message, PR description, or tag.** Commits must look
human-authored. This is non-negotiable and overrides any default
behavior. If a template or tool tries to inject such a trailer, strip it
before committing.

## Branching

- Prefer **trunk-based development**: `main` is always releasable;
  integrate via **short-lived feature branches** (hours to ~2 days) and
  merge fast. Long-lived branches rot and cause painful merges.
- **git-flow** (`develop` + `release/*` + `hotfix/*`) only when you ship
  versioned releases on a slow cadence; it is overhead for continuous
  delivery.
- Branch names: `feat/quote-builder`, `fix/login-redirect`,
  `chore/bump-deps`. Lowercase, hyphenated, scoped.
- Rebase your branch onto fresh `main` before opening a PR so it merges
  cleanly and review sees only your changes.

## Conventional Commits

- Format: `type(scope): subject`. Types: **feat, fix, chore, refactor,
  docs, test**, plus `build`, `ci`, `perf`, `style`, `revert`.
- Scope is the affected module: `feat(billing): add invoice export`.
- **Breaking change**: append `!` (`feat(api)!: drop v1 endpoints`) and
  add a `BREAKING CHANGE:` footer explaining the migration.
- Subject in **imperative mood**, ≤ ~50 chars, no trailing period:
  "add", not "added"/"adds".

## Atomic commits

- **One logical change per commit.** A commit should be revertable in
  isolation without dragging unrelated work with it.
- Don't bundle a refactor + a feature + a formatting sweep into one
  commit. Split with staged hunks (`git add -p`) into focused commits.
- Each commit should build and pass tests on its own — bisect depends on
  it.

## Commit messages

- **Subject = what** (imperative). **Body = why** — the context,
  trade-offs, and what was rejected. The diff already shows *how*; it
  rarely shows *why*.
- Wrap the body at ~72 chars. Reference issues in a footer
  (`Refs #123`, `Closes #123`).
- Bad: "fix stuff", "wip", "update". Good:
  `fix(auth): refresh token before expiry to stop 401 on idle tabs`.

## Pull request hygiene

- **Small and focused.** A PR a reviewer can read in < ~15 min gets
  better review than a 2,000-line dump. Split large work into stacked PRs.
- **Self-review first** — read your own diff before requesting review;
  catch debug logs, stray files, and `TODO`s.
- Description gives **context, what changed, how to test, screenshots**
  for UI. The reviewer should not have to reverse-engineer intent.
- Keep PRs green: lint, types, and tests must pass in CI before merge.

## Rebase vs merge

- **Rebase** local/personal branches to keep linear history; `git pull
  --rebase` to avoid noise merge commits.
- **Merge** (or squash-merge) into shared branches. Squash-merge keeps
  `main` history one-commit-per-PR and tidy.
- **Never rebase or force-push a branch others have pulled** — it
  rewrites shared history and breaks their clones.

## Clean history & .gitignore discipline

- **Never commit**: secrets/`.env`, credentials, `*.db`/SQLite files,
  `node_modules`, build output (`dist/`, `.next/`, `target/`), editor
  cruft, large binaries. Keep `.gitignore` current.
- If a secret was committed, **rotate it immediately** — removing it from
  history does not un-leak it.
- Don't commit **commented-out code** or dead code "just in case"; Git is
  the history. Delete it.

## Pre-commit hooks

- Run **format, lint, typecheck** on staged files via `lefthook`,
  `husky` + `lint-staged`, or `pre-commit`. Fast feedback before CI.
- Hooks may also block commits containing secrets (e.g. `gitleaks`).
- **Do not bypass with `--no-verify`** to dodge a failing check — fix the
  underlying problem. Bypassing is the exception, justified out loud.

## Semantic versioning, tags & releases

- **SemVer `MAJOR.MINOR.PATCH`**: breaking / feature / fix. Pre-release
  suffixes `-alpha.1`, `-rc.1`.
- Tag releases with **annotated tags** (`git tag -a v1.4.0 -m ...`), not
  lightweight tags — they carry author, date, and message.
- Conventional Commits enable automated changelogs/version bumps
  (`changesets`, `release-please`, `semantic-release`).

## Anti-patterns to refuse

1. **Giant mixed commits** — refactor + feature + reformat in one blob.
   Unreviewable and un-revertable. Split it.
2. **Committing secrets or generated files** — `.env`, `*.db`,
   `node_modules`, build output. Gitignore them.
3. **Force-pushing a shared branch** — rewrites history others depend on.
4. **Vague messages** — "fix stuff", "wip", "update". Say what and why.
5. **Committing commented-out / dead code** — Git already remembers it.
6. **Any AI co-author / attribution trailer** — `Co-Authored-By: Claude`,
   "Generated with Claude", or similar. Strictly forbidden (see top).
7. **`--no-verify` to skip hooks** rather than fixing the failure.

## Common gotchas

1. **`git pull` defaults to a merge**, creating noise merge commits on
   feature branches. Configure `pull.rebase=true` (or
   `git pull --rebase`) for linear history.
2. **A committed-then-gitignored file stays tracked.** Adding it to
   `.gitignore` does nothing until you `git rm --cached <file>` and
   commit the removal.
3. **Squash-merge collapses the body.** If your PR has meaningful
   per-commit context, fold the important "why" into the squash message —
   it won't survive otherwise.
4. **Amending or rebasing already-pushed shared commits** forces everyone
   to recover. Only rewrite history that lives solely on your machine.

## Reference repos

See `sources.json`. Highlights: Conventional Commits spec, SemVer spec,
and the pre-commit / lint-staged tooling.
