# Skill — Security (security-reviewer enforcement)

**Activate when**: agent role is `security-reviewer`, OR any task
touching auth, data, secrets, or external input.

You are the gate that rejects insecure code before it ships. Reviews are
reject-oriented: assume input is hostile, assume the attacker has the
source, and require defense at the **server** boundary, not the UI.

## OWASP Top 10 (current) — what to enforce

1. **Broken Access Control (#1)** — every protected operation checks
   authorization **in the handler/use-case**, against the authenticated
   identity, on the **specific resource**. UI hiding a button is not
   access control.
2. **Cryptographic Failures** — TLS everywhere; no MD5/SHA1 for
   passwords (use Argon2id/bcrypt/scrypt); don't roll your own crypto.
3. **Injection** — parameterize all queries; validate + encode all
   input. Covers SQL, NoSQL, OS command, LDAP.
4. **Insecure Design** — threat-model the feature; deny by default.
5. **Security Misconfiguration** — no debug endpoints, default creds,
   verbose errors, or open admin in prod.
6. **Vulnerable/Outdated Components** — see supply chain below.
7. **Identification & Authentication Failures** — see authn below.
8. **Software & Data Integrity Failures** — verify signatures of
   updates/CI artifacts; pin dependencies.
9. **Security Logging & Monitoring Failures** — log auth events and
   access-control denials (without leaking secrets).
10. **SSRF** — see below.

## Input validation + output encoding

- **Validate at the trust boundary** with an allowlist schema (Zod /
  class-validator / Bean Validation). Reject unknown fields; coerce and
  bound types (length, range, enum, format).
- Validation is **not** a substitute for **context-aware output
  encoding**: HTML-escape for HTML, attribute-encode for attributes,
  parameterize for SQL, JSON-encode for JSON. The right defense depends
  on the **sink**.
- Validate on the **server**. Client-side validation is UX only;
  attackers call the API directly.

## Authentication vs authorization

- **Authn = who you are; authz = what you may do.** Both required;
  conflating them is a top finding.
- Passwords: Argon2id (or bcrypt cost ≥ 12), per-user salt (built into
  the hash), never reversible. Enforce length over composition rules.
- Sessions: rotate on privilege change, short idle timeout, `HttpOnly`
  + `Secure` + `SameSite` cookies, server-side revocation.
- **Authorize every request on the actual resource owner**, not just
  "is logged in". Object-level checks prevent IDOR (below).

## JWT pitfalls

- **Reject `alg: none`** and **never** let the token header pick the
  algorithm — pin the expected `alg` server-side. Don't accept HS256 on
  a key meant for RS256 (alg-confusion attack).
- Verify `exp`, `iss`, `aud`; keep lifetimes short; use refresh tokens
  with rotation + revocation list.
- **Storage**: prefer `HttpOnly` cookies over `localStorage`
  (localStorage is readable by any XSS). If using cookies, add CSRF
  protection.
- JWTs can't be revoked once issued — keep them short or maintain a
  denylist for logout/compromise.

## Injection — SQL / NoSQL

- **Always parameterized queries / prepared statements / ORM
  bindings.** Never build SQL by string concatenation with user input.
- Dynamic identifiers (table/column/sort) that can't be parameterized
  must be **allowlisted**, never interpolated raw.
- NoSQL: reject operator objects from user input (`{ "$gt": "" }`);
  cast to expected scalar types before querying.

## XSS / CSRF / SSRF / IDOR

- **XSS** — encode on output; set a strict **Content-Security-Policy**;
  never `innerHTML`/`dangerouslySetInnerHTML`/`v-html` with untrusted
  data; sanitize rich text with a vetted lib (DOMPurify).
- **CSRF** — for cookie-based auth, require anti-CSRF tokens or
  `SameSite=Strict/Lax` + verify `Origin`/`Referer`. Token auth in a
  header is not CSRF-able.
- **SSRF** — never fetch a user-supplied URL without an **allowlist** of
  hosts/schemes; block private/link-local ranges (169.254.169.254,
  10/8, 127/8, ::1) and redirects to them. Critical for webhooks,
  image-proxy, importers.
- **IDOR** — every object access checks ownership/tenant against the
  caller. `GET /invoices/123` must verify 123 belongs to the caller's
  tenant. Use unguessable IDs as defense-in-depth, never as the only
  control.

## Multitenancy — Postgres RLS

- Enable **Row-Level Security** (`ALTER TABLE ... ENABLE ROW LEVEL
  SECURITY` + `FORCE`) on **every** tenant-scoped table; the policy
  filters by a session var (`current_setting('app.tenant_id')`) set per
  request inside a transaction.
- RLS is the **last line of defense** so an app-layer bug can't leak
  cross-tenant data. App-layer `WHERE tenant_id = ?` alone is not
  enough — one missing clause leaks everything.
- Test RLS with **two tenants** asserting tenant A cannot read tenant
  B's rows. Watch out: table owners and `BYPASSRLS` roles skip
  policies — the app role must not have them.

## Secrets management

- **No secrets in code or plaintext `.env` committed to VCS.** Use AWS
  Secrets Manager / SSM Parameter Store (Harry's stack), Vault, or the
  platform's secret store. Inject at runtime.
- Rotate on exposure; scope per-environment; least-privilege IAM on the
  secret. Add a pre-commit secret scanner (gitleaks/trufflehog).
- If a secret was ever committed, it is **compromised** — rotate it,
  don't just remove the line.

## Supply chain / dependencies

- Commit **lockfiles**; pin versions; run `npm audit` /
  `pnpm audit` / `osv-scanner` / Dependabot in CI and gate on
  high/critical.
- Prefer few, well-maintained deps; review new transitive deps;
  beware typosquats and post-install scripts.
- Verify integrity (lockfile hashes); avoid `latest`/floating ranges in
  production builds.

## Least privilege, rate limiting, secure defaults

- Every credential/role/IAM policy grants the **minimum** needed.
  Database app role: no superuser, no `BYPASSRLS`.
- **Rate-limit** auth, password reset, and expensive endpoints; add
  lockout/backoff to defeat brute force and credential stuffing.
- **Secure by default**: deny unless allowed; CORS locked to known
  origins; cookies secure; new endpoints authenticated unless explicitly
  public.

## PII & logging

- Classify PII; encrypt at rest and in transit; minimize collection;
  honor deletion. Mask in non-prod.
- **Logs must never contain** passwords, tokens, full card/PAN, secrets,
  or full PII. Redact before logging. Logs are an exfil target.
- **Never return stack traces / internal errors to clients** — return a
  generic message + correlation id; log details server-side.

## Anti-patterns to refuse

1. **Trusting client input** — using client-supplied IDs, roles,
   prices, or `isAdmin` flags without server re-validation.
2. **Authz only in UI/middleware** — the handler/use-case must re-check
   permission on the specific resource. Middleware-only checks miss
   direct calls and object-level access.
3. **Secrets committed** — keys/tokens/passwords in source, `.env`, or
   client bundles (`NEXT_PUBLIC_*`, compiled Flutter assets).
4. **`eval` / dynamic SQL string concatenation** — string-built queries
   or `eval`/`Function`/dynamic `exec` on untrusted input.
5. **Permissive CORS `*` with credentials** — `Access-Control-Allow-
   Origin: *` together with credentials, or reflecting arbitrary
   `Origin`. Allowlist explicit origins.
6. **Returning stack traces to clients** — leaks paths, versions, and
   query structure to attackers.
7. **Missing RLS on a multitenant table** — any tenant-scoped table
   without enforced RLS is a cross-tenant breach waiting to happen.
8. **`alg: none` / unpinned JWT alg / tokens in localStorage** —
   forgeable or XSS-stealable auth.

## Common gotchas

1. **RLS bypass by table owner** — policies don't apply to the table
   owner or `BYPASSRLS` roles. The runtime app role must be neither, and
   use `FORCE ROW LEVEL SECURITY`.
2. **CORS is not authorization** — it only constrains browsers; servers
   and curl ignore it. Never rely on CORS to protect data.
3. **JWT verify vs decode** — `decode` does not check the signature.
   Always `verify` with the pinned key and algorithm.
4. **Validation lib defaults allow extra fields** — enable
   `whitelist`/`forbidNonWhitelisted` (class-validator) or `.strict()`
   (Zod) or mass-assignment slips through.
5. **TOCTOU on access checks** — re-check authorization atomically with
   the mutation (same transaction), not in a separate earlier step.
6. **Timing/enumeration leaks** — login and password-reset should not
   reveal whether an account exists (uniform response + timing).

## Reference repos

See `sources.json`. Highlights: OWASP ASVS & Cheat Sheets,
`colinhacks/zod`, `cure53/DOMPurify`, `gitleaks/gitleaks`,
`google/osv-scanner`, Postgres RLS docs.
