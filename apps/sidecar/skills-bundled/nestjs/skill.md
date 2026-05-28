# Skill — NestJS (Clean/Hexagonal Architecture, TypeScript)

**Activate when**: `preferredStack` matches `/nest|nestjs/i` or the
discovery doc locks NestJS as the backend.

Production NestJS for 2026. The framework gives you DI, modules, and a
request lifecycle — clean architecture is what keeps it maintainable.

## Layered / hexagonal layout

Domain at the center, framework at the edges. Dependencies point INWARD
only.

- **domain/** — entities, value objects, domain errors, repository
  **ports** (interfaces). Zero NestJS imports. Pure TypeScript.
- **usecases/** (application) — one class per use case, orchestrates
  domain + ports. Depends on domain interfaces, never on infrastructure
  concretes.
- **infrastructure/** — adapters that implement ports: TypeORM/Prisma
  repositories, HTTP clients, queue producers, mappers. The only place
  that imports DB/SDK packages.
- **entrypoints/** (interface) — controllers, GraphQL resolvers, message
  consumers, cron. Thin: validate input, call a use case, map output.

Wire it in Nest modules: a feature module declares its controllers
(entrypoint), binds ports to concrete providers via custom tokens, and
re-exports nothing it doesn't own.

## Dependency injection done right

- **Depend on abstractions.** Use cases inject a port token, not a
  concrete repo:
  `@Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort`.
- Bind in the module: `{ provide: USER_REPOSITORY_PORT, useClass: TypeOrmUserRepository }`.
- Use **`Symbol`** or `const` string tokens for ports; never inject by a
  class you'd otherwise have to import from infrastructure into domain.
- **Constructor injection only.** No property injection, no service
  locator (`moduleRef.get` outside dynamic/factory cases).
- Default scope is **singleton** — keep providers stateless. Reach for
  `Scope.REQUEST` only when you truly need per-request state; it has a
  perf cost and cascades to every dependent.

## Controllers stay thin

- A controller method: receive a validated DTO, delegate to one use
  case, return a response DTO. **No business logic, no DB access, no
  branching on domain rules.**
- Don't inject repositories or ORM into controllers. Inject use cases.
- Map domain results to response DTOs explicitly — never `return entity`.

## DTOs + validation

- **Request DTOs** with `class-validator` + `class-transformer`, OR a
  `ZodValidationPipe` if the stack standardizes on Zod. Pick one per
  project, don't mix.
- Enable globally:
  `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))`.
  `whitelist` strips unknown props; `forbidNonWhitelisted` rejects them.
- **Response DTOs** are separate classes. Use `class-transformer`
  `@Exclude()`/`@Expose()` + `ClassSerializerInterceptor`, or explicit
  mappers. Never serialize an ORM entity straight to the wire.
- Validate enums, lengths, formats at the boundary so the domain can
  assume well-formed input.

## Cross-cutting concerns (the Nest lifecycle)

Order per request: **middleware → guards → interceptors (pre) → pipes →
handler → interceptors (post) → exception filters**.

- **Guards** — authn/authz. `AuthGuard`, `RolesGuard` with a
  `@Roles()` decorator + `Reflector`. Return boolean / throw.
- **Pipes** — validation + transformation of params/body (the global
  `ValidationPipe`, `ParseUUIDPipe`, etc.).
- **Interceptors** — wrap the handler: logging, response envelope,
  timing, caching, transaction boundaries.
- **Exception filters** — map thrown errors to HTTP. A global
  `AllExceptionsFilter` translates domain errors to RFC 7807-style
  bodies and hides internals. Throw typed domain errors from use cases;
  filter does the HTTP mapping. (See `rest-api` skill for error shape.)

## Configuration

- **`@nestjs/config`** with `ConfigModule.forRoot({ isGlobal: true })`.
- **Validate env at boot** with a Zod/Joi schema (`validate` /
  `validationSchema`). Fail fast on missing/invalid config — never read
  `process.env` directly in services.
- Inject typed config via `ConfigService` or a typed `registerAs`
  namespace. No magic strings scattered through the code.

## Persistence: TypeORM vs Prisma

- **TypeORM** — decorator entities, `Repository` pattern fits the
  port/adapter layering naturally, mature migrations, supports the
  active-record OR data-mapper style (use **data-mapper**). Good default
  when the team knows it.
- **Prisma** — schema-first, best-in-class type safety and DX, simpler
  queries, but its client is the concrete; wrap it behind a repository
  port so the domain stays decoupled.
- Either way: **map ORM models to domain entities** in infrastructure.
  Don't let `@Entity` decorators bleed into the domain layer.
- Migrations are code-reviewed and committed. No `synchronize: true` in
  production.

## Testing (Jest)

- **Unit-test use cases** with in-memory fakes of the ports — fast, no
  Nest container needed. This is where domain logic coverage lives.
- **Integration-test** repositories/adapters against a real DB
  (Testcontainers) when behavior depends on SQL.
- Controller/e2e tests via `Test.createTestingModule` +
  `supertest` for the HTTP contract.
- Override providers in the testing module
  (`.overrideProvider(TOKEN).useValue(fake)`).

## Helper / structural patterns

- One **use case = one public method** (`execute`/`run`). Single
  responsibility; easy to test and compose.
- **Mappers** are pure functions/classes in infrastructure
  (entity↔domain, domain↔DTO).
- **Result/Either** or typed domain exceptions for expected failures;
  reserve thrown exceptions for truly exceptional paths if the team
  prefers explicit results.
- Barrel `index.ts` per layer for clean imports, but avoid barrels that
  create import cycles.

## Code policy (enforced)

- **Zero filler comments.** No `// constructor`, no `// inject service`,
  no commented-out code. Comment only non-obvious WHY.
- **All new source in English** — identifiers, errors, logs. Pre-existing
  user-facing strings may stay in their original language; do not
  translate them gratuitously.
- **No `any`.** Use generics, `unknown` + narrowing, or proper types.

## Anti-patterns to refuse

1. **Fat controllers / business logic in controllers** — branching on
   domain rules, DB calls, or orchestration inside a controller. Move it
   to a use case.
2. **Injecting repositories or the ORM into controllers** — controllers
   depend on use cases only.
3. **Leaking ORM entities as API responses** — always map to a response
   DTO. Returning `@Entity` objects exposes columns, relations, and
   lets internals drift into the contract.
4. **Circular dependencies** — especially `forwardRef()` to paper over a
   bad module boundary. Restructure so dependencies point inward; extract
   a shared module if two features genuinely need each other.
5. **`any` or untyped responses** — every handler has a typed return; no
   `any` in DTOs, providers, or signatures.
6. **Domain importing NestJS/infrastructure** — `@Injectable` or
   `@Entity` in the domain layer, or use cases importing a concrete
   repository instead of a port.
7. **Reading `process.env` directly** in services — go through validated
   `ConfigService`.
8. **`synchronize: true` / auto-migrations in production.**

## Common gotchas

1. **`Scope.REQUEST` cascades** — any provider depending on a
   request-scoped provider becomes request-scoped too, killing the
   singleton perf win and breaking some lifecycle hooks. Keep it
   localized.
2. **Global `ValidationPipe` needs `transform: true`** to instantiate
   DTO classes and coerce types (e.g. string query param → number);
   without it `class-transformer` decorators don't run.
3. **Exception filters don't catch errors thrown in other filters or in
   `main.ts` bootstrap** — guard bootstrap separately.
4. **Custom provider tokens must be exported** from the module that
   provides them for another module to inject — `exports` array is
   easy to forget, yielding "Nest can't resolve dependencies".
5. **`ConfigModule` must be imported (or global) before any provider
   that injects `ConfigService`** — ordering/`isGlobal` matters.

## Reference repos

See `sources.json`. Highlights: `nestjs/nest`, official
`nestjs/typescript-starter`, `nestjs/awesome-nestjs` clean-architecture
examples, `colinhacks/zod`, `typestack/class-validator`.
