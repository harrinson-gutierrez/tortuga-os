# Skill — Flutter (3.22+, Material 3)

**Activate when**: project's `preferredStack` matches `flutter*` or the
discovery doc locks Flutter as primary frontend.

You are working on a Flutter app. This skill gives you the canonical
library choices, anti-patterns to refuse, and gotchas to anticipate so
your plan / code matches 2026 production practice.

> **The sidecar will verify your work with objective gates** (PLAN v2 §3):
> `flutter analyze` (G1), architecture lint (G2), `flutter build` (G3), boot
> on emulator (G4), fidelity vs Figma frame (G5), real-work cross-check (G6),
> WCAG AA (G7). An approve you write is overridden by any red gate. Build to
> pass the gates, not to convince a reviewer.

## Fidelity to the Figma frame — TODO es todo (NON-NEGOTIABLE)

The frame is the source of truth. Every property is reproduced exactly and
verified one by one (G5). "Casi igual" = reject.

1. **Read the LITERAL spec, never assume.** Call `get_design_context` by the
   screen's nodeId and copy the exact values: hex colors, shadow
   `offset/blur/rgba(...)`, gradient colors + stops + **angle**, font
   family/size/weight/tracking/color, and the **copy strings character for
   character** (incl. `¿?`, `¡!`). The screenshot alone is not enough.
2. **Download the frame PNG** to the task's `fidelity/` folder so the sidecar
   can build the side-by-side (`03-tareas/<code>/fidelity/`).
3. **Reproduce, then walk the checklist** property by property: text (copy,
   family, size, weight, color, tracking, alignment, mixed-color runs), fills
   (screen bg, card, inputs, borders), gradients (colors, stops, exact angle,
   direction not inverted), shadows (each layer: offset, blur, rgba), shape
   (radius, dimensions), background blobs (size, position, clip, opacity),
   spacing (padding, gaps on the 4pt grid, side margins), icons.
4. A single unjustified mismatch is a reject — fix it before approving.

## textTheme central — mandatory

Map the frame's type ramp to the central `textTheme` ONCE in
`app_theme.dart`, then reference `Theme.of(ctx).textTheme.*` everywhere.

- Each ramp entry carries the frame's exact `fontSize`, `fontWeight`
  (`w400/500/600/700/900` — Black is `w900`, not Bold), `letterSpacing`
  (e.g. `1.54`, `-0.64`, `1.2`), `height`, and `color`.
- **Forbidden: `TextStyle(fontSize: ...)` inline in `features/`** — G2
  rejects it. Adjusting the ramp fixes text app-wide.
- Sizes flow through `textTheme` so they scale with the system text scaler
  (G7). Never pin `textScaler` to `1.0`.

## State management

- **flutter_bloc** (Cubit + Bloc) — default for non-trivial features.
  Explicit event-driven flow, easy audit trail, pairs with `bloc_test`.
- **riverpod 3** — acceptable alternative for small teams or velocity-
  first MVPs. Compile-time safe, no `BuildContext` dependency.
- **signals** — only for hot UIs where surgical rebuilds matter.
- **DO NOT use `setState` for non-trivial features.** Single-widget
  toggles only. Anything else gets a Cubit.

## Responsive — devices separated, mobile FIRST (§5.1)

Each screen is built ONLY for mobile today, faithful to the phone frame.
NEVER an elastic layout that serves all devices badly.

- Split devices through `ResponsiveLayout` (`lib/core/layout/device_class.dart`):

  ```dart
  ResponsiveLayout(
    mobile: (_) => const _LoginMobile(),     // faithful to the 390pt frame
    // tablet:  (_) => const _LoginTablet(),  // TODO when a tablet frame exists
    // desktop: (_) => const _LoginDesktop(), // TODO when a desktop frame exists
  )
  ```

- **Today: only `mobile`.** The mobile layout is never stretched to tablet.
- **Tomorrow:** add a builder per device, each against ITS OWN Figma frame.
  The mobile layout is not touched.
- **Forbidden:** branching a single widget's layout on `MediaQuery` width
  (`if (width > 600) ...`) — G2 rejects it. Use proportional sizing within a
  device builder; switch devices only via `ResponsiveLayout`.

## Fixed-canvas screens MUST survive the keyboard (§5.2)

A screen authored as a fixed 390×844 canvas scaled to the device (the
`FittedBox` + `SizedBox(390×844)` + `Positioned` pattern) gives a pixel-faithful
base state — but it BREAKS when the soft keyboard opens if you scale with
`BoxFit.fill`: the canvas is squashed into the shrunken viewport and labels
overlap their fields (a real GASTUU bug — the `CLAVE` label landed on top of its
input when the keyboard showed). Any screen with a `TextField`/`DsTextField`
MUST be keyboard-safe:

- **Scale with `BoxFit.fitWidth`, never `BoxFit.fill`.** `fitWidth` keeps the
  390:844 aspect ratio (no vertical squash); `fill` distorts it the moment the
  available height changes.
- **Wrap the canvas in a `SingleChildScrollView`** whose child has the SCALED
  canvas height (`availableWidth / 390 * 844`). When the keyboard steals height
  the content scrolls instead of compressing.
- **Set `Scaffold(resizeToAvoidBottomInset: true)`** (the default) so the body
  shrinks by the inset and the scroll view can reveal the focused field.

Canonical keyboard-safe wrapper for a fixed-canvas mobile screen:

```dart
Scaffold(
  resizeToAvoidBottomInset: true,
  body: LayoutBuilder(
    builder: (context, c) {
      final scale = c.maxWidth / 390;            // canvas authored at 390 wide
      return SingleChildScrollView(
        // bottomInset lets the last field clear the keyboard
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
        child: SizedBox(
          height: 844 * scale,                   // scaled canvas height, no squash
          child: FittedBox(
            fit: BoxFit.fitWidth,                 // NOT fill
            child: SizedBox(width: 390, height: 844, child: Stack(/* … */)),
          ),
        ),
      );
    },
  ),
)
```

A screen with NO text input may keep `BoxFit.fitWidth` without the scroll view,
but `BoxFit.fill` is forbidden everywhere — it distorts on every off-spec aspect
ratio, not just with the keyboard.

## Accessibility — WCAG AA + adaptive (§3.4)

Base state stays 100% faithful to the frame; accessibility kicks in when the
user changes preferences. Faithful by default, adaptive on demand. G7 blocks
on failures.

- **Text scaling:** respect `MediaQuery.textScaler` (never pin to 1.0). With
  scale up to 1.5–2.0, no text overflows or clips — give text room with
  `Flexible`/`Wrap`/scroll and proportional layout.
- **Contrast:** every text/background pair ≥ 4.5:1 (≥ 3:1 for large text).
  When the frame itself is below AA, fix the token and note an "a11y override".
- **Touch targets:** interactive elements ≥ 48×48 dp (avoid
  `MaterialTapTargetSize.shrinkWrap`).
- **Semantics:** meaningful `Semantics` label on every control (not "Button");
  decorative images `ExcludeSemantics`; logical focus order.
- **Dark mode:** respond to `Brightness.dark` via `DsColors.dark()`, AA there
  too. **Motion:** respect `MediaQuery.disableAnimations`.

## Fidelity loop with hot reload

Iterating with `flutter build` (~2min) is unviable. Use a live `flutter run`
and hot reload (~3s):

1. `flutter run --dart-define-from-file=env/dev.json` on the emulator.
2. Edit the screen → press `r` (hot reload) → `adb exec-out screencap -p`.
3. Compare against the frame property by property → adjust → repeat.
4. Only when it is faithful do you let the gates run the cold build (G3/G4).

## Routing

- **go_router** — default. Declarative, deep-link safe.
- **StatefulShellRoute.indexedStack** for bottom-nav with branch-local
  history. Keep nesting depth ≤ 2 shells.

## Dependency injection

- **get_it + injectable** with `build_runner` codegen.
- Features expose a `@module` class under `features/<x>/data/<x>_module.dart`
  returning the repository contract.
- Blocs registered with `@injectable` (transient). Only the
  `SessionBloc` (or equivalent) is `@singleton`.
- **MANDATORY: after adding/changing ANY `@injectable` / `@module` / `@singleton`
  (a new cubit, bloc, repo), you MUST run
  `dart run build_runner build --delete-conflicting-outputs` to regenerate
  `injection.config.dart`.** A class with `@injectable` that isn't in the
  generated config compiles fine but crashes at runtime with
  `Bad state: GetIt: type X is not registered`. The build gate (G3) now runs
  build_runner for you, but never hand off a feature whose `sl<X>()` /
  `getIt<X>()` calls aren't backed by a regenerated DI config — verify the
  type appears in `injection.config.dart` before approving.

## Forms

- **formz** — type-safe field validators, decoupled from UI.
- Pair with `flutter_bloc`'s `FormzSubmissionStatus` so the bloc owns
  validation state.

## Localization

- `intl` + `flutter_localizations` + ARB files.
- `flutter gen-l10n` workflow with `l10n.yaml`. Template language stays
  `es_CO` (or whatever the project requires); `intl_*.arb` per locale.
- Every key with a placeholder needs `@key.placeholders`.
- Numbers in money: `FontFeature.tabularFigures()` on every TextStyle.

## Charts

- **fl_chart** — line, bar, pie, scatter, radar. **Gotcha**:
  performance degrades at 1000+ points; aggregate server-side or use
  windowing.

## Icons

- **phosphor_flutter** (duotone variant for primary surfaces, regular
  for inline). Never mix with `Icons.*` Material Symbols.

## Networking

- **dio** — interceptors, retry, file upload, cancellation. Singleton
  pattern + interceptors for logging/auth.
- **http** for simple GET/POST without retry policy.

## Testing

- **flutter_test** (built-in) for unit/widget.
- **bloc_test** for Bloc/Cubit emission ordering.
- **mocktail** for null-safe mocks (no codegen). Refuse `mockito` in new
  code.

## Goldens

- **alchemist** — bundles fonts, fixes DPR for CI, supports light/dark
  variants in a single test. Replaces `golden_toolkit`.

## Theme + tokens

- Define `ThemeExtension<T>` per token group (`DsColors`, `DsGradients`,
  `DsShadows`, `DsMotion`, `DsMemberPalette` for GASTUU-style apps).
- Register on `ThemeData(extensions: [...])` in both `light()` and
  `dark()` factories.
- Consume via `Theme.of(ctx).extension<DsColors>()!.brandPrimary`.
- Implement `copyWith` AND `lerp` on every extension.
- **Gotcha**: `ColorScheme.fromSeed` can drift the surface tone away
  from your brand. Always `copyWith` the roles you care about after
  `fromSeed`, or use `DynamicSchemeVariant.fidelity`.

## Linting

- **very_good_analysis** pinned in `analysis_options.yaml`.
- `custom_lint` only if you adopt project-specific rules.

## Android 15 / edge-to-edge (NON-NEGOTIABLE for `targetSdk >= 35`)

Android 15 (API 35) **forces edge-to-edge by default**. The opt-out
flag `windowOptOutEdgeToEdgeEnforcement` was removed — apps targeting
35+ MUST handle insets themselves. Symptoms when this is ignored:

- Status bar (clock / notch / camera area) overlaps content.
- Gesture navigation bar overlaps bottom nav / FAB.
- Floating action buttons land under the system pill.
- Snackbars / bottom sheets paint behind the gesture bar.

### Mandatory setup

1. **AndroidManifest** — no `android:fitsSystemWindows="true"` (deprecated).
2. **`MainActivity.kt`**: nothing special, Tauri / Flutter handles it.
3. **`main.dart`** — call `SystemChrome` BEFORE `runApp`:

   ```dart
   void main() async {
     WidgetsFlutterBinding.ensureInitialized();
     await SystemChrome.setEnabledSystemUIMode(
       SystemUiMode.edgeToEdge,
       overlays: SystemUiOverlay.values,
     );
     SystemChrome.setSystemUIOverlayStyle(
       const SystemUiOverlayStyle(
         statusBarColor: Colors.transparent,
         systemNavigationBarColor: Colors.transparent,
         statusBarIconBrightness: Brightness.dark,  // flip for dark mode
         systemNavigationBarIconBrightness: Brightness.dark,
       ),
     );
     runApp(const MyApp());
   }
   ```

4. **`AppShell` / root layout** — wrap routed content with `SafeArea`
   (or `MediaQuery.viewPaddingOf(ctx)`) and use `extendBody: true`
   on `Scaffold` so the body paints behind the bottom nav but the
   children respect inset:

   ```dart
   Scaffold(
     extendBody: true,
     extendBodyBehindAppBar: true,
     body: SafeArea(child: ...),
     bottomNavigationBar: Padding(
       padding: EdgeInsets.only(
         bottom: MediaQuery.viewPaddingOf(context).bottom,
       ),
       child: DsFloatingNav(...),
     ),
   )
   ```

5. **Floating action buttons / DsFAB**: compose `Positioned` with
   `bottom: MediaQuery.viewPaddingOf(ctx).bottom + AppSpacing.xl`,
   never a hard-coded `bottom: 24`.

6. **Modal bottom sheets** — use `showModalBottomSheet(useSafeArea: true)`.

7. **Status-bar text color**: dynamic per route. Light surfaces need
   `Brightness.dark` icons, dark surfaces need `.light`. Use
   `AnnotatedRegion<SystemUiOverlayStyle>` around the scaffold:

   ```dart
   AnnotatedRegion<SystemUiOverlayStyle>(
     value: theme.brightness == Brightness.dark
         ? SystemUiOverlayStyle.light
         : SystemUiOverlayStyle.dark,
     child: Scaffold(...),
   )
   ```

### Anti-patterns

- `Padding(padding: EdgeInsets.only(top: 24))` to "leave room for the
  status bar". Use `MediaQuery.viewPaddingOf(ctx).top`.
- `bottomNavigationBarTheme` with a fixed height that doesn't add
  the gesture inset.
- `Scaffold` with `body:` directly (no SafeArea) on a screen that has
  no `AppBar`. The status-bar area becomes a dead zone — content
  appears under the clock.
- Setting `enableEdgeToEdge` in the manifest as a workaround. It only
  works for `targetSdk <= 34`; on 35 it's a no-op.

### Verification

A target API 35 build that hides nothing under the system bars
satisfies these greps:

- `rg "viewPaddingOf|viewInsetsOf|MediaQuery.padding" lib/` → non-empty
  (the app reads insets somewhere).
- `rg "SafeArea\|extendBody" lib/app/router lib/core/widgets` → non-empty.
- `rg "SystemUiMode.edgeToEdge" lib/main.dart` → exactly one match.
- `rg "EdgeInsets.only\(top: \d+\)" lib/features` flag-suspicious;
  hard-coded top insets usually hide the inset bug.

The boot gate (G4) screenshots the first frame of every screen; the
fidelity gate (G5) confirms the status bar and gesture bar neither cover
content nor leave an awkward gap.

## DS widget contract (enforced by the architecture gate G2)

Feature screens compose ONLY with `lib/core/widgets/ds_*.dart` widgets.
Bare `Card`, `Container(decoration:)`, `Color(0xFF...)`, `Colors.X`,
inline `TextStyle` in `lib/features/**/presentation/**` are rejected.
If a DS widget is missing, build it under `lib/core/widgets/` first
with a golden test, then consume it.

### Shared enums/constants live in domain, NEVER inside a widget

A widget file (`lib/core/widgets/ds_*.dart`) imports `flutter/material`, so
ANY type declared in it is UI-tainted. The moment a calculator, model, or
use case in `domain/` needs that type, it is forced to import the widget and
drag Material into the domain layer — G2 rejects it (`layer:domain-imports-widget`).

The rule: **a type the domain layer references is a domain concept and
belongs in `domain/`, not in the widget that renders it.**

- A semantic enum (`DsVerdictVariant { healthy, warning, risk }`), a status,
  a value object, or a shared constant goes in `lib/core/domain/<name>.dart`
  (or the feature's `domain/`), with NO Flutter import.
- The `ds_*` widget that renders it IMPORTS it from domain. It may
  `export` it for ergonomic UI-side use, but it must not OWN it.
- Decide ownership when you create the type: "will any calculator / model /
  use case read this?" → if yes, it is domain. Putting it in the widget
  "for now" guarantees a G2 reject the moment the logic lands.

## Functional tests (enforced by the smoke gate G-smoke)

Compiling and booting is NOT working. Every feature that has a `domain/`
or `data/` layer (use cases, repositories, datasources) MUST ship a
functional test that exercises the real flow end to end. The gate runs
`flutter test integration_test` and rejects the step when a feature with
logic has no test, or when the suite fails.

Rules:

1. Use the `integration_test` harness (`integration_test:` under
   `dev_dependencies`, `IntegrationTestWidgetsFlutterBinding.ensureInitialized()`
   in the test entry). One `*_test.dart` per feature under
   `integration_test/`, named after the feature (e.g.
   `integration_test/contribution_test.dart`).
2. Test the BEHAVIOUR a user gets, not the widget tree: pump the feature's
   screen with its real Bloc/Cubit wired through `get_it`, drive it
   (`tester.tap`, `enterText`, `pumpAndSettle`), and assert the resulting
   state — the success path AND at least one failure/empty path.
3. Fake the BOUNDARY only (datasource / http / supabase client) with
   `mocktail`; never mock the use case or bloc under test. The point is to
   prove the wiring, validation, and state transitions actually run.
4. A pure presentation-only folder (static design-system showcase, splash)
   needs no functional test — the gate skips a repo with no feature logic.

## Anti-patterns to refuse

1. `catch (_) { }` or `catch (e) { emit(Failure()) }` without
   propagating `e`. Every `Failure` carries `Object cause` +
   `StackTrace?`.
2. `Color(0xFF...)` or `Colors.X` in `lib/features/`.
3. **Business logic** via `setState` in screens — async work, repo/usecase/bloc
   calls, data fetching belong in a Bloc/Cubit. Purely-local UI state
   (`PageView`/carousel index, password obscure toggle, expand/collapse, tab
   index) via `setState` is fine and the G2 gate allows it.
4. Mocking with `mockito` — use `mocktail` for null safety.
5. Three+ nested `StatefulShellRoute` (refactor UX first).

## Common gotchas

1. **M3 surface drift from `fromSeed`** — bright seeds yield darker
   surfaces. Either `copyWith` every controlled role, or set
   `dynamicSchemeVariant: DynamicSchemeVariant.fidelity`.
2. **fl_chart at 1000+ points** — frame drops. Aggregate or window.
3. **Impeller iOS `BackdropFilter.blur`** — 16ms+ raster overhead.
   Limit blur bounds with `ClipRect`; test on real device. Skia is OK.

## Reference repos

See `sources.json`. Highlights: `flutter/samples`,
`VeryGoodOpenSource/very_good_analysis`, `Betterment/alchemist`,
`phosphor-icons/flutter`, `flutter/flutter` (issues / changelog).
