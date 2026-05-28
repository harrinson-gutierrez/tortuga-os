# `@tortuga-os/depcruise-config`

Boundary rules enforced via [`dependency-cruiser`](https://github.com/sverweij/dependency-cruiser).

Single source of truth for the architectural contract described in
[`docs/PACKAGE-STRUCTURE.md`](../../docs/PACKAGE-STRUCTURE.md).

## Use it from the repo root

```jsonc
// dependency-cruiser will pick up this config via package resolution.
// Either reference it from a thin local file:
//   .dependency-cruiser.cjs
//
//   module.exports = require('@tortuga-os/depcruise-config')
```

Then run:

```bash
pnpm boundaries
```

(See the `boundaries` script in the root `package.json`.)

## The rules in one paragraph

1. `@tortuga-os/domain` depends on nothing else in the workspace.
2. `@tortuga-os/core` depends only on `@tortuga-os/domain` + `@tortuga-os/contracts`.
3. `@tortuga-os/api-server` and `@tortuga-os/mcp-server` are peers; neither imports the other.
4. Frontends (`apps/web`, `apps/desktop`, `@tortuga-os/ui`, `@tortuga-os/ui-flows`) never reach into `core` or `domain`. They go through `api-client` + `contracts`.
5. `@tortuga-os/contracts` is type-and-schema only; it depends on nothing in the workspace.

Plus three hygiene rules:

- no app imports another app;
- production code never imports `test-fixtures/`;
- no circular dependencies anywhere.

## Why some rules look inert today

Several packages (`domain`, `core`, `ui`, `ui-flows`, `api-server`, `mcp-server`,
`api-client`, `storage-sqlite`, `runners-shell`, `fs-workspace`) do not exist
yet — they land in subsequent migration steps. dependency-cruiser only fires a
rule when both `from` and `to` patterns match real files, so those rules are
silent until the matching packages appear. The day someone creates the first
file under `packages/domain/`, the boundary is enforced from minute zero.
