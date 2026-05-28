/**
 * Tortuga OS — boundary rules.
 *
 * Source of truth: docs/PACKAGE-STRUCTURE.md ("Dependency rules — the only
 * architecture that matters"). Each `forbidden` entry below maps to one of
 * the five hard rules.
 *
 * Some of the target packages (domain, core, ui, ui-flows, api-server,
 * mcp-server, api-client, storage-sqlite, runners-shell, fs-workspace) do
 * not exist yet. dependency-cruiser only validates rules whose `from` and
 * `to` patterns actually match files in the current tree, so the future
 * rules are inert until those packages land. Keeping them here as part
 * of the config means the day a developer creates the first `domain` file,
 * the boundary is enforced from minute zero.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    // ── Rule 1: @tortuga-os/domain depends on NOTHING ──────────────────────
    {
      name: 'domain-no-imports',
      severity: 'error',
      comment:
        'domain is pure types + invariants + state machines. It must not import anything else from the workspace, including @tortuga-os/contracts.',
      from: { path: '^packages/domain/' },
      to: {
        path: '^(packages/(?!domain/)|apps/)',
      },
    },

    // ── Rule 2: @tortuga-os/core only depends on domain + contracts ────────
    {
      name: 'core-only-domain-and-contracts',
      severity: 'error',
      comment:
        'core orchestrates use-cases over a Storage *port*. It depends on domain + contracts; never on storage-sqlite, transports, frontends.',
      from: { path: '^packages/core/' },
      to: {
        path: '^(packages/(?!core/|domain/|contracts/)|apps/)',
      },
    },

    // ── Rule 3: transports never import each other ─────────────────────────
    {
      name: 'api-server-no-mcp',
      severity: 'error',
      comment:
        'api-server and mcp-server are peers, not nested. They share core, never each other.',
      from: { path: '^packages/api-server/' },
      to: { path: '^packages/mcp-server/' },
    },
    {
      name: 'mcp-server-no-api',
      severity: 'error',
      comment: 'mcp-server and api-server are peers, not nested.',
      from: { path: '^packages/mcp-server/' },
      to: { path: '^packages/api-server/' },
    },

    // ── Rule 4: frontends never import core or domain directly ─────────────
    {
      name: 'apps-no-core',
      severity: 'error',
      comment:
        'apps/web and apps/desktop call the orchestrator through api-client, never reach into core. Their UI surface is ui + ui-flows + contracts.',
      from: { path: '^apps/(web|desktop)/' },
      to: { path: '^packages/(core|domain)/' },
    },
    {
      name: 'ui-no-core',
      severity: 'error',
      comment:
        'ui and ui-flows are presentational. They consume contracts and api-client; they never reach into core or domain.',
      from: { path: '^packages/ui(-flows)?/' },
      to: { path: '^packages/(core|domain)/' },
    },

    // ── Rule 5: contracts may only depend on domain (which is purely type) ─
    {
      name: 'contracts-no-runtime',
      severity: 'error',
      comment:
        'contracts is a type-and-schema package. It may consume the canonical enums from domain (which itself depends on nothing) but never depends on storage, transports, or apps.',
      from: { path: '^packages/contracts/' },
      to: {
        path: '^(packages/(?!contracts/|domain/)|apps/)',
      },
    },

    {
      name: 'no-cross-app-imports',
      severity: 'error',
      comment: 'Apps must not import each other. Reuse goes through packages.',
      from: { path: '^apps/([^/]+)/' },
      to: { pathNot: '$1', path: '^apps/' },
    },

    // ── Hygiene: production code never imports test fixtures ───────────────
    {
      name: 'no-test-fixtures-in-prod',
      severity: 'error',
      comment: 'test-fixtures are for tests only.',
      from: {
        path: '^(packages|apps)/',
        pathNot: '\\.(test|spec)\\.ts$|/tests?/|/test-fixtures/',
      },
      to: { path: '^packages/test-fixtures/' },
    },

    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden across the whole workspace.',
      from: {},
      to: { circular: true },
    },

    // ── General sanity: no orphans in packages (sources reached from nothing) ─
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan source files (no incoming references). Usually a left-over from a deletion.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(json|d\\.ts|tsbuildinfo)$',
          '(^|/)(jest|vite|vitest|drizzle|tsup|tailwind|postcss|biome)\\.config\\.(js|ts|cjs|mjs)$',
          '\\.eslintrc',
          '/tsconfig\\.json$',
          '/index\\.(ts|tsx|cjs|mjs)$',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'dist-bundle', 'target', '.tauri', 'data'],
    },
    exclude: {
      path: '(^|/)(node_modules|dist|dist-bundle|target|\\.tauri|data)/',
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
