<!--
Tortuga OS — PR template. PR title MUST be a valid Conventional Commit.
  example: feat(kanban): allow drag between adjacent columns
  example: fix(sidecar): 5s timeout on MCP tools
-->

## What

<!-- One paragraph: what does this PR change, and why? -->

## Type

- [ ] `feat` — new functionality
- [ ] `fix` — bug fix
- [ ] `refactor` — internal change, no behavior change
- [ ] `chore` — deps, infra, build, CI
- [ ] `docs` — docs-only
- [ ] `breaking` — see [CONTRIBUTING §6](../CONTRIBUTING.md#6-breaking-changes)

## Scope

<!-- Which packages / apps does this touch? e.g. apps/sidecar, packages/core -->

## How to test

<!-- Manual steps. If the change is UI, attach a screenshot. -->

1.
2.
3.

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` (biome) passes
- [ ] Self-reviewed the diff (no leftover logs, no TODOs without an issue link)
- [ ] If DB changed: migration generated via `pnpm db:generate` and applied locally
- [ ] If UI changed: screenshot below
- [ ] If breaking: migration section completed below + `breaking` label on the PR

## Migration (only for `breaking` PRs)

<!-- Describe the impact and how downstream code should adapt. Delete this section if the PR is not breaking. -->

## Screenshots (for UI PRs)

<!-- Before / after or just after. Delete if not applicable. -->
