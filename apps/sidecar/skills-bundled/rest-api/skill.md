# Skill — REST API design (HTTP, contracts, 2026)

**Activate when**: any backend agent is building/changing HTTP
endpoints, OR `preferredStack` implies a REST backend (nest, express,
api). Pairs with `nestjs` for implementation specifics.

Design the contract first; the framework is an implementation detail. A
REST API is a long-lived public surface — treat breaking changes as
expensive.

## Resource modeling & naming

- URLs name **resources (nouns), never actions**: `/orders`,
  `/orders/{id}`, `/orders/{id}/items`. No `/getOrder`, `/createUser`.
- **Plural collection nouns**, lowercase, hyphenated:
  `/purchase-orders`, not `/purchaseOrders` or `/PurchaseOrder`.
- Nest sub-resources at most ~2 levels deep
  (`/orders/{id}/items/{itemId}`); beyond that, use a top-level resource
  with a filter.
- **Non-CRUD actions** that don't fit a verb: model as a sub-resource or
  a controller resource — `POST /orders/{id}/cancellation` or
  `POST /orders/{id}:cancel`. Avoid free verbs in the path.

## HTTP verbs & semantics

- **GET** — read, safe, no side effects, cacheable.
- **POST** — create / non-idempotent action. Returns `201` + `Location`.
- **PUT** — full replace, **idempotent**.
- **PATCH** — partial update (JSON Merge Patch RFC 7396 or JSON Patch
  RFC 6902).
- **DELETE** — remove, idempotent.
- Respect safety/idempotency: GET/HEAD/OPTIONS safe; GET/PUT/DELETE/HEAD
  idempotent; POST/PATCH are not (unless you add an idempotency key).

## Status codes (use them correctly)

- **200** OK, **201** Created (+`Location`), **202** Accepted (async),
  **204** No Content (successful DELETE / empty body).
- **400** validation/malformed, **401** unauthenticated, **403**
  authenticated-but-forbidden, **404** not found, **405** method not
  allowed, **409** conflict (e.g. version/duplicate), **410** gone,
  **412** precondition failed (ETag), **422** semantic validation,
  **429** rate limited (+`Retry-After`).
- **500** unexpected, **503** unavailable. Never expose a stack trace.
- **Never return `200` for an error.** The status code IS the contract.

## Idempotency

- Make **PUT/DELETE** naturally idempotent.
- For **POST** that creates money/orders, accept an
  **`Idempotency-Key`** header; store the key + first response and replay
  it on retries within a TTL. Prevents double-charges on client retries.

## Pagination

- **Cursor-based** (opaque `cursor` token) for large/changing datasets —
  stable under inserts, scales. Preferred default.
- **Offset/limit** (`?page=&size=` or `?offset=&limit=`) acceptable for
  small, stable, randomly-addressable sets; degrades on deep pages and
  shifts under writes.
- Always return pagination metadata: `next`/`prev` cursors (or
  total/page), and a sane **default + max page size**.
- **Every collection endpoint is paginated.** No unbounded list that
  returns the whole table.

## Filtering, sorting, sparse fields

- Filter via query params: `?status=open&createdAfter=2026-01-01`.
- Sort: `?sort=-createdAt,name` (`-` = descending). Whitelist sortable
  fields server-side.
- Sparse fieldsets: `?fields=id,name`. Embedding/expansion:
  `?include=customer`. Document and bound what's allowed.

## Versioning

- **URL versioning** `/{v1}/...` — simplest, most visible, easiest to
  route/cache/curl. Default choice.
- **Header/media-type** versioning (`Accept: application/vnd.app.v2+json`)
  — cleaner URLs, harder to test/observe. Use only if the org mandates
  it.
- **Never ship a breaking change without a new version.** Additive
  changes (new optional field, new endpoint) are non-breaking; removing/
  renaming fields, changing types, or tightening validation is breaking.
- Communicate deprecation with the `Deprecation` and `Sunset` headers.

## Error response shape (RFC 7807)

- Use **`application/problem+json`**:
  `{ "type": "https://errors.app/validation", "title": "Validation failed", "status": 422, "detail": "...", "instance": "/orders/123", "errors": [...] }`.
- Consistent shape across the whole API; include a machine-readable
  `type`/code and a stable correlation/`traceId` for support.
- **Never leak stack traces, SQL, internal hostnames, or library
  errors** to clients. Log details server-side; return a sanitized
  problem document.

## HATEOAS — pragmatic

- Full hypermedia is rarely worth it. **Be pragmatic**: include
  `Location` on create, `next`/`prev` links in pagination, and links for
  genuinely discoverable state transitions. Don't build a HAL framework
  nobody consumes.

## Contract-first / OpenAPI

- **OpenAPI 3.1 is the source of truth.** Author or generate the spec
  and keep it in the repo. Generate client types/SDKs and validate
  requests/responses against it in tests.
- Document every status code, error shape, auth scheme, and pagination
  param. The spec is the contract reviewers check against.

## Auth

- **Bearer tokens / JWT** in `Authorization: Bearer <token>`. Validate
  signature, `exp`, `aud`, `iss` on every request.
- Short-lived access tokens + refresh; revocation strategy for logout.
- `401` for missing/invalid credentials, `403` for insufficient scope.
- Never put tokens or secrets in the URL/query string (they land in
  logs and caches).

## Rate limiting

- Enforce per-client/key limits. Return **`429`** with **`Retry-After`**
  and `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`
  headers (IETF RateLimit fields).
- Document limits in the API docs.

## Caching headers

- **`ETag`** + conditional `If-None-Match` → `304 Not Modified` for
  cheap revalidation; `If-Match` for optimistic concurrency on writes
  (`412` on mismatch).
- **`Cache-Control`** (`max-age`, `no-store`, `private`/`public`,
  `stale-while-revalidate`) per resource sensitivity. Mark
  authenticated/PII responses `private`/`no-store`.
- `Last-Modified` as a weaker alternative to ETag.

## Anti-patterns to refuse

1. **Verbs in URLs** — `/getUsers`, `/createOrder`, `/order/delete`.
   Use nouns + HTTP methods.
2. **`200 OK` for errors** — returning success status with an error body
   (`{ "error": ... }`). Use the correct 4xx/5xx code.
3. **Leaking stack traces / internal errors** to clients. Return a
   sanitized `problem+json`; log internals server-side.
4. **Breaking changes without a version bump** — removing/renaming
   fields, changing types, tightening validation on an existing version.
5. **Unbounded list endpoints** — any collection without pagination and
   an enforced max page size.
6. **Inconsistent error shapes** across endpoints — standardize on one
   problem-document format.
7. **Auth tokens or secrets in the URL/query string.**
8. **Misusing status codes** — `404` for forbidden, `400` for
   not-found, `200` for "created", etc.

## Common gotchas

1. **PATCH vs PUT confusion** — PUT replaces the whole resource (omitted
   fields are cleared); PATCH is partial. Picking the wrong one silently
   drops data.
2. **Offset pagination drift** — rows inserted/deleted between page
   requests cause skipped or duplicated items. Cursor pagination avoids
   this.
3. **POST retries double-create** — network retry without an
   `Idempotency-Key` creates duplicate resources/charges.
4. **CORS is not auth** — `Access-Control-*` headers are a browser
   policy, not a security boundary. Enforce authz server-side regardless.
5. **ETag with a load balancer** — weak vs strong ETags and per-node
   hash differences can break `304` revalidation; generate ETags
   deterministically.
6. **Timezone/format ambiguity** — always use ISO 8601 UTC
   (`2026-05-22T10:00:00Z`) for timestamps; document money as
   minor-units integers + currency code, not floats.

## Reference repos

See `sources.json`. Highlights: `OAI/OpenAPI-Specification`, Microsoft &
Zalando REST guidelines, RFC 7807/9457 (problem+json), `stripe` API as a
gold-standard reference.
