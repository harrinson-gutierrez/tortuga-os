# Skill — AWS (Serverless-first, Lambda · Cognito · S3 · DynamoDB · API Gateway)

**Activate when**: `preferredStack` or the discovery doc mentions AWS,
Lambda, Cognito, S3, DynamoDB, or API Gateway; OR any infra/deploy agent
runs on an AWS project.

Serverless-leaning AWS patterns for 2026. Default to managed/serverless
primitives; reach for EC2 only when a workload genuinely needs persistent
compute. Provision everything through IaC (see the `iac` skill) — never
clickops.

## Lambda

- **Runtime**: Node.js 22 or Python 3.13. Build on **ARM64 / Graviton2** —
  ~20% cheaper and faster than x86 for almost all workloads. Set
  `architecture: arm64`.
- **Cold starts**: keep the deployment package small, init the SDK and DB
  clients **outside** the handler (module scope = warm reuse), lazy-load
  heavy deps. For latency-critical sync paths use **provisioned
  concurrency** or **SnapStart** (Java/.NET); for everything else, accept
  cold starts and design async.
- **Layers**: share common deps / native binaries across functions. Cap at
  5 layers, 250 MB unzipped total. Don't bury app code in layers — they're
  for vendored deps, not your business logic.
- **Idempotency**: any retried or async-invoked handler MUST be idempotent.
  Use an idempotency key (DynamoDB conditional put with TTL, e.g. AWS Lambda
  Powertools idempotency utility). API Gateway + SQS + EventBridge all
  deliver at-least-once.
- **Async + DLQ**: every async invocation (S3, SNS, EventBridge, SQS) needs
  a **dead-letter queue** or `onFailure` destination. Without it, failed
  events vanish silently.
- **Concurrency**: set **reserved concurrency** to protect downstream
  (e.g. a Postgres connection pool) from a Lambda storm. Use **RDS Proxy**
  if Lambda talks to RDS/Aurora to avoid exhausting connections.
- **Observability**: structured JSON logs, X-Ray tracing, EMF metrics via
  Powertools. One log group per function; set retention (logs default to
  never-expire = surprise bill).

## API Gateway

- **HTTP API** (v2) is the default: ~70% cheaper, lower latency, simpler.
  Use **REST API** (v1) only when you need request/response validation
  models, WAF, API keys + usage plans, edge-optimized endpoints, or private
  integrations not on HTTP API.
- **Authorizers**: native **JWT authorizer** for Cognito (HTTP API) — zero
  custom code. **Lambda (REQUEST) authorizer** for custom logic; cache the
  policy (`authorizerResultTtlInSeconds`) to avoid invoking per request.
- **Throttling**: set account + per-route rate/burst limits. REST API usage
  plans for per-client quotas. Protects backend and your bill.
- Prefer **direct service integrations** (API GW → DynamoDB/SQS/StepFns)
  over a pass-through Lambda when there's no business logic — less cost, no
  cold start.

## Cognito

- **User Pools** = authN (identity, sign-up/in, MFA, password policy).
  **Identity Pools** = authZ to AWS resources (temp IAM creds), and
  **federated identity** (Google/Apple/SAML/OIDC).
- **App clients**: one per surface (web SPA = no secret + PKCE; mobile =
  no secret; server-to-server = client credentials + secret). Never embed
  a client secret in a browser/mobile app.
- **Scopes & resource servers**: define custom OAuth scopes on a resource
  server for machine-to-machine and fine-grained API access.
- **Triggers** (Lambda):
  - **preTokenGeneration**: inject custom claims (tenant id, roles,
    plan) into the ID/access token. Keep it fast and side-effect-free;
    it's on the hot auth path. V2 trigger can add claims to the **access**
    token, not just ID token.
  - **postConfirmation**: provision the user row / tenant after sign-up
    confirmation (write to DynamoDB/Postgres, send welcome via SES). Make
    it idempotent — it can fire more than once.
  - Others worth knowing: preSignUp (auto-confirm/validate domain),
    customMessage (branded emails), migrateUser (lazy import from legacy).
- Store `sub` (immutable) as the user key, never email (mutable).
- Token validation on APIs: verify signature against the pool JWKS,
  check `iss`, `aud`/`client_id`, `token_use`, and `exp`.

## S3

- **Presigned URLs**:
  - **Upload**: prefer **presigned POST** (lets you enforce
    content-length-range, content-type, key prefix) for browser uploads;
    presigned PUT for simple programmatic puts. Short expiry (5–15 min).
  - **Download**: presigned GET for time-limited private object access.
    Don't make the bucket public to serve files — front it with CloudFront
    + OAC instead.
  - For large files use **multipart upload** with presigned part URLs.
- **Block Public Access ON** at account + bucket level. Grant access via
  bucket policy / IAM / OAC, never an ACL.
- **Encryption**: SSE-S3 by default; **SSE-KMS** with a customer-managed
  key when you need key rotation, audit trail, or per-tenant isolation.
  Enforce with a bucket policy denying unencrypted puts.
- **Lifecycle**: transition to IA / Glacier and expire by prefix; abort
  incomplete multipart uploads after N days (silent cost leak otherwise).
- Enable **versioning** + MFA-delete on critical buckets; access logging
  or CloudTrail data events for audit.

## DynamoDB

- **Single-table design** is the default for known access patterns: model
  entities into one table, design **PK/SK** around your queries (not your
  entities), overload keys (`USER#123` / `ORDER#456`).
- **GSIs** for secondary access patterns; project only needed attributes.
  Use **sparse GSIs** for filtered subsets. Max relevance, min cost.
- **On-demand** capacity by default (spiky/unknown traffic, zero capacity
  planning). Switch to **provisioned + auto-scaling** only for steady,
  predictable, high volume where it's measurably cheaper.
- **Streams** → Lambda for CDC, aggregation, fan-out. TTL attribute for
  auto-expiry of ephemeral rows (sessions, idempotency keys).
- **When NOT to use DynamoDB → use Postgres**: ad-hoc/analytical queries,
  complex joins, flexible filtering you can't predefine, strong relational
  integrity, reporting. If access patterns are unknown or query-heavy,
  Postgres (Aurora Serverless v2 / RDS) + RLS for multitenancy beats
  contorting DynamoDB. DynamoDB rewards predictable key-based access; it
  punishes scans.

## SES / SNS

- **SES** starts in **sandbox**: only verified to/from addresses, low
  quota. Request production access early. Verify a **domain identity**
  (DKIM + SPF + DMARC) — not just single addresses — for deliverability.
- **Bounce/complaint handling is mandatory**: subscribe an SNS topic to
  SES notifications, suppress bounced/complained addresses, keep rates
  under AWS thresholds or you get throttled/suspended. Use the
  configuration set + account-level suppression list.
- **SNS** for pub/sub fan-out (→ SQS, Lambda, HTTP, mobile push) and SMS.
  For transactional SMS verify use case / register sender id where
  required. Prefer SNS→SQS fan-out so consumers get retries + DLQ.

## IAM least-privilege

- One **role per function/service**; scope actions and **resource ARNs**
  to exactly what's needed. No `*` resource unless the action genuinely
  has no resource scope.
- Use **condition keys** (`aws:SourceArn`, `aws:PrincipalTag`,
  `s3:prefix`) to tighten. Tag-based / ABAC for multitenant scoping.
- **No IAM users** for apps — roles + temp creds (instance profiles for
  EC2, task roles for ECS, OIDC for CI). Human access via IAM Identity
  Center (SSO), not long-lived keys.

## Anti-patterns to refuse

1. **Wildcard IAM (`Action: "*"`, `Resource: "*"`)** — grant only the
   specific actions on specific ARNs. A starter "AdministratorAccess" role
   on a Lambda is a refusal.
2. **Secrets in plaintext env vars** — DB passwords, API keys, signing
   secrets belong in **Secrets Manager** (rotation) or **SSM Parameter
   Store SecureString**, fetched/cached at cold start. Lambda env vars are
   visible to anyone with `GetFunctionConfiguration`.
3. **Public S3 buckets to serve assets** — keep Block Public Access on;
   serve via CloudFront + OAC or presigned URLs.
4. **Async Lambda with no DLQ / failure destination** — failed events are
   lost forever.
5. **Hardcoded AWS credentials** in code, config, or env — use roles and
   the default credential chain. Hardcoded keys = immediate refusal.

## Common gotchas

1. **Lambda + RDS connection exhaustion** — each warm container holds a
   connection; a burst opens hundreds and kills Postgres. Use **RDS Proxy**
   and reserved concurrency, or move that access pattern to DynamoDB.
2. **CloudWatch Logs never expire by default** — every Lambda's log group
   grows forever. Set retention (e.g. 14–30 days) in IaC or it becomes a
   silent recurring bill.
3. **SES sandbox surprise in prod** — you ship, emails to unverified
   recipients silently fail. Confirm production access + domain verification
   before launch.
4. **preTokenGeneration latency** — heavy work (DB lookups, network) in the
   trigger adds latency to every login and can time out the auth flow. Keep
   it minimal; precompute claims elsewhere when possible.
5. **DynamoDB late access-pattern change** — you can't add a new query
   cheaply if PK/SK weren't designed for it; you end up scanning. Model
   access patterns up front, or you'll be migrating tables.

## Reference repos

See `sources.json`. Highlights: AWS Lambda Powertools, AWS SDK for
JavaScript v3, Cognito + amplify-js, aws-samples serverless patterns,
Serverless Land.
