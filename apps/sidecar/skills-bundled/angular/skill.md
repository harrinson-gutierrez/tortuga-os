# Skill — Angular (v18+ standalone, signals, TypeScript)

**Activate when**: `preferredStack` matches `/angular/i` or the
discovery doc locks Angular as primary frontend.

Modern Angular for 2026. **Standalone is the default**; NgModules are
legacy. Signals are the reactivity model; RxJS is for streams/async.

## Standalone components (no NgModules)

- Every component/directive/pipe is `standalone: true` (the default
  since v19). Declare deps in the component's own `imports: []`.
- Bootstrap with `bootstrapApplication(AppComponent, { providers: [...] })`.
  No `AppModule`.
- Providers live in `app.config.ts` (`ApplicationConfig`) via
  `provideRouter`, `provideHttpClient`, `provideAnimations`, etc.
- **No new NgModules.** If you find yourself writing `@NgModule`, stop.

## Signals (state model)

- **`signal()`** for writable state, **`computed()`** for derived values,
  **`effect()`** for side effects (run sparingly — not for deriving
  state).
- **`input()`** / **`output()`** signal-based component IO replace
  `@Input`/`@Output`. `input.required<T>()` for mandatory inputs;
  `model()` for two-way binding.
- `linkedSignal()` for state that resets when a source changes.
- **`toSignal()` / `toObservable()`** bridge RxJS ↔ signals at the edges.
- Signals make change detection fine-grained; pair with **zoneless**
  (`provideZonelessChangeDetection()`) where the app is fully migrated.

## When to use RxJS vs signals

- **Signals**: synchronous local/derived state, template bindings,
  component IO. Default for UI state.
- **RxJS**: streams over time — HTTP, WebSockets, debounced inputs,
  combining multiple async sources, retry/backoff. Don't force everything
  into signals.
- Convert the stream result to a signal with `toSignal()` for the
  template; keep the operator pipeline in RxJS.

## Change detection

- **`changeDetection: ChangeDetectionStrategy.OnPush` on every
  component.** Non-negotiable for performance. Signals + OnPush update
  only the affected view.
- With OnPush, mutate via signals or new immutable references — never
  mutate objects/arrays in place and expect the view to update.

## Built-in control flow

- Use **`@if` / `@else`**, **`@for`**, **`@switch`** — not the legacy
  `*ngIf` / `*ngFor` / `*ngSwitch` structural directives.
- `@for` **requires `track`** (`@for (item of items(); track item.id)`).
  Tracking by identity on large lists is a real perf bug.
- `@defer` blocks for lazy-loading heavy/below-the-fold content with
  `@placeholder`, `@loading`, `@error`.

## Component architecture (smart/dumb split)

- **Smart (container)** components: inject services, hold/coordinate
  state, handle routing. Few of them.
- **Dumb (presentational)** components: `input()` in, `output()` out,
  no service injection, OnPush, easily testable and reusable. Most of
  your components.
- Keep components small and single-responsibility. Extract reusable UI
  primitives instead of duplicating markup.

## Dependency injection

- Prefer the **`inject()`** function over constructor params in new code:
  `private readonly http = inject(HttpClient);`. Cleaner with mixins,
  base classes, and functional guards/interceptors.
- Provide services with `@Injectable({ providedIn: 'root' })` for
  app-wide singletons; route-level providers for feature scoping.
- Use **`InjectionToken`** for non-class deps (config, env).

## Typed reactive forms

- **Reactive forms, fully typed.** `FormGroup<{ ... }>`,
  `NonNullableFormBuilder` to avoid `| null` noise.
- Avoid template-driven forms for anything beyond trivial inputs.
- Validation via typed validators; surface errors accessibly
  (`aria-invalid`, linked error text).

## HttpClient + interceptors

- `provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))`
  — **functional interceptors**, not class-based.
- Interceptors handle auth headers, error normalization, retry, loading
  state. Keep them small and composable.
- Type every response (`http.get<User[]>(...)`). No untyped HTTP.
- Use `withFetch()` for the fetch backend (SSR-friendly).

## Routing & lazy loading

- **Lazy-load routes** with `loadComponent` (standalone) /
  `loadChildren` returning route arrays — no lazy `NgModule`.
- **Functional guards/resolvers** (`CanActivateFn`, `ResolveFn`) using
  `inject()`. Class guards are deprecated style.
- Co-locate feature routes; provide feature services at the route level
  for scoping.

## State management

- **Default to signals + services** ("signal store" pattern: a service
  exposing `signal()`/`computed()`). Sufficient for most apps.
- **NgRx SignalStore** for structured, scalable feature state with the
  signals model. Use over classic NgRx Store/Effects in new code unless
  the team already standardizes on Redux-style.
- Pick one approach per app; don't mix three state libraries.

## Testing

- **Vitest** (or Jest) + Angular Testing Library for component behavior;
  Karma is legacy.
- **Playwright** for e2e (auth, critical flows).
- Test dumb components by setting inputs and asserting outputs/DOM; test
  services by asserting signal/stream values. Mock HTTP with
  `HttpTestingController`.

## Code policy (enforced)

- **Zero filler comments.** No `// constructor`, no obvious restating.
- **All new source in English.** Pre-existing user-facing strings may
  stay; don't translate gratuitously.
- **No `any`.** Type inputs, outputs, HTTP responses, form models.

## Anti-patterns to refuse

1. **NgModules in new code** — use standalone components,
   `bootstrapApplication`, and provider functions.
2. **Manual `.subscribe()` without cleanup** — leaks subscriptions. Use
   the `async` pipe, `toSignal()`, or `takeUntilDestroyed()`. Refuse a
   subscribe with no teardown.
3. **`any`** anywhere — inputs, HTTP, forms, service state.
4. **Logic in templates** — complex expressions, method calls that
   recompute every CD cycle, or business branching in markup. Move to a
   `computed()` or component method.
5. **Mutating `input()` values** — inputs are owned by the parent.
   Derive with `computed()` or emit an `output()` to request a change.
6. **Missing `OnPush`** on components, or **missing `track`** in `@for`.
7. **Legacy `*ngIf`/`*ngFor`/`*ngSwitch`** in new templates — use the
   built-in control flow.
8. **`@Input`/`@Output` decorators** in new components — use signal
   `input()`/`output()`.

## Common gotchas

1. **OnPush + in-place mutation** — pushing into an array or editing an
   object field won't refresh the view. Replace the reference or use a
   signal `update()`.
2. **`effect()` misuse** — using effects to compute derived state causes
   feedback loops and extra renders. Use `computed()`; reserve `effect()`
   for genuine side effects (logging, DOM, localStorage).
3. **`toSignal()` initial value** — emits `undefined` until the source
   produces, unless you pass `{ initialValue }` or
   `{ requireSync: true }`. Template must handle the undefined window.
4. **Reading a signal in a template needs the call** — `count()` not
   `count`. Forgetting the parentheses binds the function object.
5. **Zoneless migration** — any code relying on Zone.js auto-CD
   (untracked async, third-party libs) won't refresh. Migrate state to
   signals/markForCheck before removing Zone.

## Reference repos

See `sources.json`. Highlights: `angular/angular`,
`angular/components`, `ngrx/platform` (SignalStore),
`analogjs/analog`, official `angular.dev` examples.
