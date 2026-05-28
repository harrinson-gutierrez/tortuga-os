# Skill — Testing (qa-reviewer enforcement)

**Activate when**: agent role is `qa-reviewer`, OR any task that ships
code with logic.

You are the gate that closes the "compiles but doesn't work" gap.
Reject code that lacks tests for the behavior it claims to add. Reviews
are pass/fail against concrete criteria below, not vibes.

## The hard rule: a feature without a test file is rejected

- Every feature/module with non-trivial logic MUST have a test file
  **named after it**: `invoice-calculator.ts` → `invoice-calculator.test.ts`,
  `InvoiceUseCase.java` → `InvoiceUseCaseTest.java`,
  `invoice_calculator.dart` → `invoice_calculator_test.dart`.
- This requirement aligns with the objective **G-smoke / ground-truth
  gate** (real build + test + coverage). If the gate can't find a test
  exercising the new behavior, the work is incomplete.
- Pure config, generated code, and trivial pass-through wiring are
  exempt. Anything with a branch, a calculation, a transform, a
  validation, or an external call is **not** exempt.

## Testing pyramid (proportions)

- **~70% unit** — fast, isolated, no I/O. Run in milliseconds.
- **~20% integration** — real collaborators across a seam (DB, queue,
  HTTP boundary).
- **~10% e2e** — full stack through the UI / public API. Slow, brittle,
  high value for critical user journeys only.
- Inverted pyramids (mostly e2e) are slow and flaky; ice-cream cones
  (mostly manual) don't exist in CI. Refuse both shapes.

## What to test vs not

- **Test**: business rules, branching logic, boundary/edge values,
  error paths, money/date/timezone math, permission checks, data
  transforms, serialization contracts, regressions for fixed bugs.
- **Don't test**: framework internals, third-party libs, getters/setters
  with no logic, language features, exact private implementation steps.
- Test **observable behavior through the public surface**, not private
  internals. If a refactor that preserves behavior breaks the test, the
  test was wrong.

## AAA structure

- **Arrange** — set up inputs, doubles, state.
- **Act** — invoke the single thing under test (one action).
- **Assert** — verify outcome. Prefer one logical assertion per test;
  multiple `expect`s are fine if they describe one behavior.
- Test names state behavior: `returns 0 when cart is empty`, not
  `test1`. Use `describe`/`it` (TS), `group`/`test` (Dart),
  `@Nested` + descriptive `@DisplayName` (JUnit).

## Deterministic tests (no flake)

- **No real clock**: inject the clock or use fake timers
  (`vi.useFakeTimers()`, `jest.useFakeTimers()`,
  `clock` in `fakeAsync`/`FakeAsync` for Dart, `Clock.fixed` in Java).
  Never assert on `Date.now()` / `DateTime.now()` directly.
- **No real network**: stub HTTP at the boundary (`msw`, `nock`,
  `http.MockClient` in Dart, WireMock/MockWebServer in Java). A unit
  test that hits the network is not a unit test.
- **Fixed seeds** for any randomness; inject the RNG.
- **No `sleep`/arbitrary timeouts** to "wait" for async — await the
  promise/future or use the framework's `waitFor`.
- **Order independence**: each test sets up and tears down its own
  state. No shared mutable globals between tests.

## Test doubles — pick the right one

- **Dummy** — passed to satisfy a signature, never used.
- **Stub** — returns canned answers (`getUser()` → fixed object). Use
  for inputs you control.
- **Spy** — records calls so you can assert interactions
  (`expect(send).toHaveBeenCalledWith(...)`). Use sparingly; asserting
  on calls couples to implementation.
- **Mock** — pre-programmed with expectations that fail if unmet.
- **Fake** — a working lightweight implementation (in-memory repo,
  SQLite for Postgres). **Preferred** over mocks for repositories — it
  exercises real logic and survives refactors.
- Rule: stub queries, verify commands. Don't verify queries; don't stub
  the thing you're testing.

## Coverage: signal, not goal

- Coverage tells you what is **un**tested; high % does not prove
  correctness (you can cover a line without asserting anything).
- Treat ~80% line + meaningful branch coverage as a smell threshold, not
  a target to game. Mutation testing (Stryker) is the real measure if
  available.
- The binding rule remains the **per-feature test file**, not a global
  percentage.

## Unit (Vitest / Jest)

- **Vitest** preferred for TS/JS (ESM-native, fast, Jest-compatible
  API). Jest acceptable in legacy/React Native.
- `it.each` / `test.each` for **parametrized** tests — one body, many
  input/expected rows. Cover boundaries: empty, one, many, max, null,
  negative.
- Always test the **error path**: `await expect(fn()).rejects.toThrow(X)`,
  and that the right error type/message surfaces.

## Integration (DB)

- Use **testcontainers** (real Postgres in Docker) for DB tests that
  depend on SQL features (RLS, constraints, JSONB, window functions). An
  in-memory SQLite fake will silently diverge from Postgres semantics.
- In-memory fakes are fine for **fast** repo-contract tests where SQL
  dialect doesn't matter.
- Wrap each test in a transaction and roll back, or truncate between
  tests, for isolation.

## E2E (Playwright)

- **Playwright** for web e2e — auto-wait, network interception, trace
  viewer, parallel. Cover only critical journeys: auth, checkout,
  the money path.
- Use role/label/test-id locators (`getByRole`, `getByLabel`), never
  brittle CSS/XPath chains.
- Reset state via API/seed before each spec; don't depend on prior
  tests. Quarantine, never `.skip()`-and-forget, a flaky e2e.

## Contract & snapshot

- **Contract testing** (Pact, or schema assertion on the boundary) when
  a service consumes another service/API — guarantees provider and
  consumer agree without a full e2e.
- **Snapshot tests**: acceptable as a **secondary** safety net for
  serialized output / rendered markup. Never the **primary** assertion —
  they assert "unchanged", not "correct", and get blind-`-u`-updated.
  Keep snapshots small and reviewed.

## Stack specifics — Flutter & NestJS

- **Flutter**: `flutter test` for unit/widget; `integration_test`
  package for real-device flows; `WidgetTester` + `pumpWidget` /
  `pumpAndSettle`; `mocktail` for doubles; wrap timers in `fakeAsync`.
  Test the widget's behavior (taps, rebuilds), not its private state.
- **NestJS / clean-architecture use cases**: test the **use case** in
  isolation with faked ports (repositories, gateways). The use case is
  pure orchestration — no Nest `Test.createTestingModule` needed for it.
  Reserve module/controller integration tests for the HTTP boundary and
  DI wiring.

## Anti-patterns to refuse

1. **Tests that assert nothing** — they call the code, no `expect`. A
   green test with zero assertions is worse than no test (false safety).
2. **Testing implementation details** — asserting private method calls,
   internal field values, or render order so any refactor breaks them.
3. **Mocking everything** — when every collaborator is a mock, the test
   verifies the mock, not the system. Use fakes / real seams.
4. **Flaky tests left in the suite** — a randomly-failing test trains the
   team to ignore red. Fix the determinism or quarantine it explicitly.
5. **No regression test for a fixed bug** — every bug fix MUST add a test
   that fails on the old code and passes on the fix. Non-negotiable.
6. **Snapshot as the only assertion** — proves "didn't change", not
   "works". Reject features whose sole test is a snapshot.
7. **Time/network/random in tests** — fake the clock, stub the network,
   seed the RNG. Real ones make CI nondeterministic.

## Common gotchas

1. **`toBeCalled` without args asserts too little** — assert the actual
   arguments (`toHaveBeenCalledWith`), or you'll pass on wrong calls.
2. **Async not awaited** — a forgotten `await`/`return` on a promise
   assertion makes the test pass before the assertion runs. Lint with
   `no-floating-promises` / `require-await`.
3. **Fake timers + real promises deadlock** — after advancing timers you
   must flush microtasks (`await Promise.resolve()` /
   `runAllTimersAsync`) or the awaited code never resumes.
4. **Shared module-level state** — a singleton or top-level `let` mutated
   in one test leaks into the next; reset in `beforeEach` or isolate.
5. **Coverage counts execution, not assertion** — a line can be 100%
   covered and 0% verified. Don't trust the badge; read the asserts.

## Reference repos

See `sources.json`. Highlights: `vitest-dev/vitest`,
`microsoft/playwright`, `testcontainers/testcontainers-node`,
`mswjs/msw`, `felangel/mocktail`, Stryker mutation testing.
