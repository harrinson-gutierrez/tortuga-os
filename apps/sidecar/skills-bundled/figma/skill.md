# Skill — Figma (MCP consumption)

**Activate when**: any project task that touches design fidelity, or any
agent that has Figma MCP tools wired up (product-designer, runtime-smoke).

How to consume Figma designs via MCP correctly. Two MCPs in the wild:

- **Official Figma MCP** (`mcp.figma.com`) — read+write, requires Pro seat.
- **figma-developer-mcp** (`github.com/GLips/Figma-Context-MCP`) — read-only.

## STEP 1 — Probe phase

Print `FIGMA-PROBE: start` to your reasoning. List your tools and look for
any whose name contains `figma` (case-insensitive). Classify:

- `FIGMA-PROBE: write` — has any `create_*` / `set_*` / `update_*` / `add_*`.
- `FIGMA-PROBE: read-only` — only `get_*` / `read_*` / `download_*`.
- `FIGMA-PROBE: none` — no Figma tools at all.

**Never invent a tool.** If you call one that doesn't exist the run fails.

## STEP 2 — Multi-page protocol (CRITICAL)

Figma files are paginated. Screens are routinely **not on page 1**. Always:

1. Call `mcp__figma__get_metadata(fileKey)` first. The response includes
   `pages: [{name, nodeId}]`.
2. **Log every page name** — the operator needs to see them.
3. **Iterate every page** with `get_design_context` /
   `get_screenshot` / page-scoped `get_figma_data`. Never stop after
   page 1.

A file with 6 pages is normal: cover, design system, screens, flows,
prototypes, archive. The "screens" page might be page 3 or 4.

## STEP 3 — Page classification heuristic

Classify each page by its name with these regexes:

- Screens: `/screens?|pantallas?|flows?|mockups?|ui|app|mobile|desktop|v\d+|final/i`
- Reference (tokens/components): `/design.?system|components?|tokens?|styleguide|library/i`

Anything else (`Untitled`, `Sandbox`, `Archive`, `v1-old`):

- Treat as **reference** (safe default).
- Add an entry to `## Open questions` in the discovery doc so the
  operator can decide on a future iteration.
- **Do NOT emit `verdict: needs_input`.** Classify autonomously,
  document the assumption, approve.

## STEP 4 — Frame mirroring (read-only branch)

For each frame on a screens page, write `02-diseno/screens/<name>.md`:

```markdown
# <Frame name>

**Figma**: https://www.figma.com/design/<fileKey>?node-id=<nodeId>
**Module**: <which cotización module owns it>

## Layout
{auto-layout / grid / flex description}

## Components used
{list of DS components from design-system.md with nodeIds}

## Copy strings
{verbatim copy from the frame, useful for ARB keys}

## States covered
{default / loading / empty / error / success}

## Notes
{anything unusual}
```

## STEP 5 — Tokens from reference pages

For pages classified as reference:

- Call `get_variable_defs(fileKey, nodeId)` if available — returns the
  variable collection (`{ "color/primary": "#E5533D", "spacing/sm": 8 }`).
- Pull tokens into `02-diseno/design-system.md` under sections Color,
  Typography, Spacing, Radius, Shadow, Motion.
- If no variables collection exists, infer from the frames' visible
  values — but flag in `## Open questions`.

## STEP 6 — Write branch (only if `FIGMA-PROBE: write`)

When the official MCP with write is connected:

1. `create_file(name)` — use project code as name.
2. `set_variable(...)` for every token from `design-system.md`.
3. `create_frame(pageId, ...)` per screen in the catalog.
4. Capture the returned `fileKey` → put in `figmaFileKey` of your JSON.

If a call fails (auth, quota), degrade to the read-only branch and
record the error under `## Figma write failed`.

## STEP 7 — Screenshots vs design_context

- `get_screenshot(fileKey, nodeId, maxDimension=1024)` → PNG. Use for
  visual fidelity audit, runtime-smoke side-by-side comparisons.
- `get_design_context(fileKey, nodeId, clientLanguages, clientFrameworks)` →
  structural data (layout, components, variables, code hints). Use
  for translating frame into MD spec.

## STEP 8 — URL parsing

Figma URLs look like:

```
https://www.figma.com/design/:fileKey/:fileName?node-id=:nodeId
https://www.figma.com/design/:fileKey/branch/:branchKey/:fileName
```

- `fileKey` = the path segment after `/design/`.
- `nodeId` from the URL uses `-` (e.g. `0-1` or `10-2`). When passing
  to the MCP, **convert to `:`** (`0:1`, `10:2`).
- For branches, the active key is `branchKey`, not the base `fileKey`.

## STEP 9 — Fallbacks (no Figma at all)

When `FIGMA-PROBE: none` and no URL provided:

- Write one SVG per screen at `02-diseno/screens/<Screen-Name>.svg`.
  Minimal: boxes, labels, dominant interactions. Sizes: 390×844 mobile,
  1440×900 web.
- Use safe defaults:
  - Light mode default; dark deferred.
  - Neutral palette + a single warm accent.
  - Phosphor Icons + Inter typography.
  - Airy density (consumer baseline).
- List unanswered style questions in `## Style references needed`.
- Approve. **Never emit needs_input.**

## Anti-patterns to refuse

1. **Stopping after page 1** — the most common mistake. Always iterate.
2. **Inventing a tool that isn't in the catalog** — copy the exact tool
   name from your tools list.
3. **Emitting `needs_input` when a page is ambiguous** — classify as
   reference + add to open questions.
4. **Writing SVGs alongside a real Figma file** — Figma is SoT in that
   branch.
5. **Treating a reference page as screens** (or vice versa) — check
   the regex, fall back to "reference" when unsure.

## Common gotchas

1. **File with 0 frames** — `get_metadata` returns the page list but
   `get_design_context` is empty. Fall back to SVG mockups.
2. **Page named "Untitled"** — treat as reference (no screens) until
   the operator confirms.
3. **Large file timeout on `get_metadata`** — 50+ pages, 1000+ frames
   can take 5-10s. Don't retry aggressively; reduce
   `get_screenshot(maxDimension)` to 512 for those files.

## Reference docs

See `sources.json`. Highlights: Figma MCP server docs, Figma Variables
API reference, file structure guide.
