# Skill — Supabase (Postgres + Auth + RLS + Realtime + Edge Functions)

**Activate when**: `preferredStack` mentions `supabase`, or the discovery
doc locks Supabase as the backend.

Production-ready Supabase patterns for 2026. Flutter and JS clients are
both first-class consumers.

## Row Level Security (RLS) — non-negotiable

- **Enable on every table in `public`.** Default-deny: start with
  `CREATE POLICY ... USING (false)` if no rule applies yet.
- **One policy per operation** — SELECT / INSERT / UPDATE / DELETE
  separately. INSERT needs its own policy or users can't write their
  first row.
- Use `auth.uid()` in USING / WITH CHECK.
- For views, prefer `security_invoker = true` so the underlying RLS
  applies on the row level.
- **Index every column used in RLS filters** — the policy runs on every
  query; missing index = full scan.

## Migrations

- Always `supabase migration new <name>`. Never edit applied migrations.
- Idempotent: `IF EXISTS` / `IF NOT EXISTS` / `DO $$ BEGIN ... EXCEPTION
  WHEN duplicate_object THEN NULL; END $$;`.
- Local first: `supabase db reset` before push.
- Production: forward-only. Rollback by writing a new migration.

## Triggers and functions

- **Always `SECURITY INVOKER`** unless you have a concrete reason for
  DEFINER.
- When you DO need `SECURITY DEFINER`, **always** `SET search_path = ''`
  inside the function body. Always qualify schema: `public.table_name`.
  The advisor will flag any DEFINER function without an empty
  search_path.
- Use `pg_temp` only for ephemeral helpers; never read user data.

## Realtime

- One `channel()` per subscription. Don't multiplex unrelated topics on
  the same channel.
- `postgres_changes` is RLS-aware — observers only receive rows they
  could SELECT.
- `broadcast` is for ephemeral client-to-client messages (typing
  indicators, cursors). No persistence, no RLS.
- **Debounce receivers** — bursts of 5+ changes in <500ms should
  trigger one refetch, not five.
- **Echo on submitter**: by default the channel re-delivers the change
  to the submitter. Either dedupe by row id + lastWriteTimestamp on
  the client, or wait for the trigger to commit before re-rendering.

## Auth

- **Session persistence on mobile**: `flutter_secure_storage` (uses
  Keychain on iOS, Keystore on Android). Never plain
  `shared_preferences`.
- **Refresh tokens**: enable rotation in dashboard (Auth → Sessions).
- **OAuth + deep links**: register the redirect URI in
  `Authentication → URL Configuration` for each environment. Deep link
  scheme example: `co.acme.app://callback`.
- **Email confirmation**: the user is in a `pending` state between
  signup and confirmation; `currentUser` is non-null but
  `email_confirmed_at` is null. Surface this in the UI.

## Storage

- Buckets are RLS-protected via `storage.objects`. Write policies per
  operation just like tables.
- Public buckets → signed URLs not needed (CDN-friendly). Private
  buckets → use short-TTL signed URLs (60s for previews, longer for
  downloads).
- Object names: prefix with `userId/` or `householdId/` so RLS can be
  scoped to the prefix.
- **Never** put `service_role` in client code. Storage signed URL
  generation must happen server-side (Edge Function or RPC).

## Edge Functions

- Runtime: **Deno** (TypeScript first-class).
- Secrets: `supabase secrets set KEY=value`, read via
  `Deno.env.get('KEY')`. Never commit `.env`.
- Deploy: `supabase functions deploy <name> --project-ref <ref>`.
- Use over RPC when: custom logic (validation, throttling), external
  HTTP calls (Stripe, OpenAI), file processing.
- Use RPC (Postgres function) when: pure DB logic, transactional, fast.

## Client libraries

- **Flutter**: `supabase_flutter` v2. Lazy session refresh, typed
  responses, lighter than v1.
- **JS/Web**: `@supabase/supabase-js` v2.
- **Keys**: new format is `sb_publishable_*` (client-safe) +
  `sb_secret_*` (server-only). Old JWT format `eyJhbGc...` is being
  phased out by EOY 2026 but still works. **PATs for the Management
  API start with `sbp_`** — these are different from anon/service_role.

## Performance

- Index every column used in RLS USING / WITH CHECK.
- `EXPLAIN ANALYZE` after enabling RLS on a hot table — the policy
  runs once per row.
- Rewrite policies to avoid joins where possible; prefer `IN (...)`
  with a precomputed array.
- Filter explicitly in the query AND in RLS — Postgres uses the
  query's filter for index choice; RLS alone doesn't.

## Security advisors

- After every migration: `get_advisors('security')` (via Supabase MCP).
- Fix **HIGH** and **CRITICAL** before merge. The most common HIGH:
  - "Function without `search_path`" — fix per the triggers section.
  - "Table without RLS" — enable + add policies.
  - "RLS policy too permissive" — usually a missing `auth.uid()`
    check.

## Anti-patterns to refuse

1. `service_role` key shipped to a mobile or web client.
2. Table in `public` schema with RLS disabled.
3. `SECURITY DEFINER` function without `SET search_path = ''`.
4. CORS configured as `*` on a project that has any authenticated row.
5. SELECT policy without a matching INSERT/UPDATE policy — users can
   read but can't write their own data.

## Common gotchas

1. **anon vs service_role confusion** — the JWT payload tells you the
   role. Use jwt.io. Anon respects RLS; service_role bypasses
   everything. The dashboard now calls them `Publishable` and `Secret`
   keys.
2. **PAT vs anon vs service_role** — three different kinds of secret:
   - `sbp_*` Personal Access Token, for Management API (admin / MCP).
   - `sb_publishable_*` or anon JWT, client-side, RLS applies.
   - `sb_secret_*` or service_role JWT, server-only, bypasses RLS.
3. **Realtime echo to the submitter** — see "Realtime" above. Common
   "the UI flickers / shows stale value briefly" bug.

## Reference repos

See `sources.json`. Highlights: `supabase/supabase-flutter`,
`supabase/realtime`, official Supabase docs for RLS, migrations, auth.
