# Skill — Accessibility (product-designer enforcement)

**Activate when**: agent role is `product-designer`, OR any UI task
(web, Angular, or Flutter).

Tortuga targets **WCAG 2.2 Level AA**. You are the gate that rejects UI
that excludes keyboard, screen-reader, low-vision, motor, and
reduced-motion users. Reviews are concrete and pass/fail against the
criteria below.

## POUR — the four principles

- **Perceivable** — content available to all senses (text alternatives,
  contrast, captions, not relying on color alone).
- **Operable** — usable by keyboard, no traps, enough time, no seizure
  triggers, clear focus.
- **Understandable** — readable, predictable, with helpful error
  recovery.
- **Robust** — works with assistive tech via correct semantics; valid,
  name/role/value-complete markup.

## Semantic HTML first

- Use the **native element** for the job: `<button>`, `<a href>`,
  `<nav>`, `<main>`, `<header>`, `<footer>`, `<ul>`, `<table>`,
  `<label>`, `<fieldset>`. They ship keyboard, focus, role, and state
  for free.
- A `<div onClick>` has no role, no focus, no Enter/Space handling, no
  announcement. Replacing it correctly is more code than just using
  `<button>`.
- `<a>` navigates (has `href`); `<button>` performs an action. Don't
  swap them.

## Keyboard navigation & focus

- **Everything interactive is reachable and operable by keyboard** —
  Tab/Shift+Tab to move, Enter/Space to activate, Esc to dismiss, arrow
  keys within composite widgets (menus, tabs, grids).
- **Visible focus indicator** on every focusable element (WCAG 2.2
  *Focus Appearance* / *Not Obscured*). Never `outline: none` without a
  replacement of equal-or-better visibility.
- **Logical tab order** matches visual order; don't use positive
  `tabindex`. `tabindex="0"` to add, `tabindex="-1"` for
  programmatic-only focus.
- **Manage focus** on route change, modal open (move focus in + trap
  inside + restore on close), and after async content insertion.
- **No keyboard traps** — focus must always be able to leave a
  component.

## ARIA — sparingly, native first

- **First rule of ARIA: don't use ARIA if a native element does it.**
  Bad ARIA is worse than none — it overrides correct native semantics.
- ARIA changes **semantics, not behavior**: `role="button"` on a div
  still needs you to wire Tab, Enter, Space, and focus manually.
- Use ARIA for things HTML lacks: `aria-live` regions, `aria-expanded`,
  `aria-current`, `aria-controls`, `aria-busy`, custom widget roles
  (follow the **WAI-ARIA Authoring Practices** pattern exactly).
- Never set `aria-hidden="true"` on a focusable element (hides it from
  screen readers while still tabbable — a trap).

## Color & contrast

- **Text contrast ≥ 4.5:1** (normal), **≥ 3:1** for large text (≥ 24px,
  or ≥ 18.66px bold).
- **Non-text contrast ≥ 3:1** for UI components, icons, focus
  indicators, and graph/chart boundaries that convey meaning.
- **Never use color as the only signal** — pair with text, icon, or
  pattern (error = red + icon + message; required = asterisk + text).
- Verify against the actual rendered token values, not the design comp's
  intent.

## Forms

- Every input has a **programmatically associated label**
  (`<label for>` / wrapping label / `aria-labelledby`). Placeholder is
  **not** a label.
- Group related controls with `<fieldset>` + `<legend>` (radio/checkbox
  sets).
- **Errors**: identify in text, link to the field, set `aria-invalid`,
  and reference the message via `aria-describedby`. Don't rely on color
  alone. Move focus to the first error on submit.
- **WCAG 2.2 additions**: don't require re-entering info already given
  (*Redundant Entry*); auth must not depend on memory/transcription
  puzzles (*Accessible Authentication*); inputs collecting known user
  data expose correct `autocomplete` tokens.

## Images, headings, landmarks

- **Images**: meaningful → concise `alt`; decorative → `alt=""`
  (empty, not missing); complex (charts) → adjacent long description.
- **Headings**: one logical `<h1>` per view; no skipped levels
  (`h2`→`h4`). Headings describe structure, not styling — style with
  CSS.
- **Landmarks**: `<header>`/`<nav>`/`<main>`/`<aside>`/`<footer>` (or
  ARIA roles) so screen-reader users can jump regions. One `<main>`.
  Provide a **skip-to-content** link.

## Motion & timing

- Respect **`prefers-reduced-motion`** — disable/replace non-essential
  animation, parallax, and auto-transitions for users who request it.
- No content that **flashes more than 3×/second** (seizure risk).
- Auto-playing carousels/video must be **pausable/stoppable**; provide
  controls. Avoid time limits, or make them adjustable.

## Touch targets & responsive

- **Minimum target size 24×24 CSS px** (WCAG 2.2 AA *Target Size
  Minimum*); design to **44×44** (Apple HIG / common best practice) for
  comfortable touch.
- Spacing between small targets to prevent mis-taps.
- Support 200% zoom and reflow to 320px width without horizontal scroll
  or loss of content.

## Screen-reader testing

- Test with a real screen reader: **NVDA** (Win), **VoiceOver**
  (Mac/iOS), **TalkBack** (Android). Automated tools (axe) catch
  ~30-40% of issues — manual keyboard + SR pass is required.
- Verify each control announces correct **name, role, and value/state**,
  and that dynamic updates reach `aria-live` regions.

## Flutter & Angular specifics

- **Flutter**: wrap meaningful UI in `Semantics` (or `MergeSemantics`)
  with `label`, `button: true`, `hint`, `value`; use `ExcludeSemantics`
  for decorative. Use `Tooltip`/`semanticLabel` on icon-only buttons.
  Ensure tap targets ≥ 48dp (Material) and test with TalkBack/VoiceOver.
  Don't paint custom widgets without semantics — they're invisible to SR.
- **Angular**: use Angular CDK **a11y** module — `cdkTrapFocus` for
  dialogs, `FocusMonitor`, `LiveAnnouncer` for dynamic messages,
  `cdkAriaLive`. Material components are accessible by default; preserve
  their labels. Bind `[attr.aria-*]` reactively to state.

## Anti-patterns to refuse

1. **`div`/`span` as a button** — use a real `<button>` (or
   `MaterialButton`/`role="button"` fully wired). Div buttons lack
   focus, keyboard, and role.
2. **Color as the only signal** — status/error/required conveyed by
   color alone, invisible to color-blind and SR users.
3. **Missing labels / alt** — unlabeled inputs, icon-only buttons with
   no accessible name, images with no `alt`.
4. **Keyboard trap** — focus enters a widget/modal and can't leave via
   keyboard.
5. **ARIA contradicting semantics** — `role` that fights the element,
   `aria-hidden` on focusable nodes, ARIA used where native HTML would
   do.
6. **Auto-playing motion without reduced-motion respect** — animation
   that ignores `prefers-reduced-motion`, or flashing > 3×/s.
7. **Contrast below threshold** — text < 4.5:1, large text/UI/focus
   < 3:1.
8. **`outline: none` with no replacement** — removes the visible focus
   indicator.

## Common gotchas

1. **Placeholder is not a label** — it vanishes on input and many SRs
   skip it. Always pair a real label.
2. **`aria-label` overrides visible text** — a mismatch between the
   visible label and `aria-label` confuses voice-control users; keep the
   accessible name including the visible text.
3. **Focus lost after dynamic change** — deleting/closing the focused
   element drops focus to `<body>`; move focus to a sensible neighbor.
4. **`display:none`/`visibility:hidden` vs `aria-hidden`** — the first
   removes from tab + SR; `aria-hidden` only hides from SR but leaves it
   tabbable. Don't mix them incorrectly.
5. **Heading level chosen for size** — picking `<h3>` because it "looks
   right" breaks the outline. Pick the level for structure, style with
   CSS.
6. **Automated audit ≠ accessible** — a clean axe run with a broken
   keyboard flow still fails AA. Manual pass required.

## Reference repos

See `sources.json`. Highlights: W3C WCAG 2.2 & WAI-ARIA APG,
`dequelabs/axe-core`, Angular CDK a11y, Flutter accessibility docs,
`w3c/aria-practices`.
