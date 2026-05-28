# Skill — Next.js (App Router, React 19, TypeScript)

**Activate when**: `preferredStack` matches `nextjs*` or the discovery
doc locks Next.js as primary frontend.

Production-ready Next.js patterns for 2026. App Router is the default;
Pages Router is legacy.

## App Router structure

- `app/` directory is canonical. `layout.tsx` wraps subtrees with
  persistent UI.
- **Route groups** `(group)` organize routes without affecting URL.
- **Parallel routes** with `@slot` render multiple pages in one
  layout (dashboards, sidebars, modals).
- **Intercepting routes** `(.)` capture a route segment at render
  time (modal overlay without changing URL).
- **Dynamic routes**: `[slug]`, `[...slug]` catch-all, `[[...slug]]`
  optional catch-all. Use `generateStaticParams()` for static SSG.

## Server vs Client components

- **Default: Server Components.** Zero JS to client, can access
  secrets / DB / file system directly, render children that are
  client components.
- **`'use client'`** only at the leaf nodes that need hooks
  (`useState`, `useContext`, `useEffect`), event listeners, or
  browser-only APIs.
- React Server Components reduce JS bundle by 40-70% vs full client
  render. Combine with `<Suspense>` for streaming.

## Server Actions

- `'use server'` on async functions called from forms / buttons.
- **Prefer over API routes** for simple mutations. Type-safe
  end-to-end.
- API routes (`app/api/.../route.ts`) still needed for: third-party
  webhooks, file uploads, raw streaming responses.
- **Security**: validate EVERY input with Zod. Don't trust
  client-supplied IDs. Check auth/permissions inside the action body,
  not only in middleware.

## Data fetching

- `fetch(url, { next: { revalidate: 3600 } })` for ISR.
- `fetch(url, { cache: 'no-store' })` for real-time.
- `fetch(url, { next: { tags: ['posts'] } })` + `revalidateTag('posts')`
  for tag-based invalidation.
- After a Server Action mutates data: `revalidatePath('/posts')` or
  `revalidateTag('posts')`. Without this the UI shows stale data.
- `export const dynamic = 'force-dynamic'` opts a whole route out of
  caching when you can't use the above.

## Styling

- **Tailwind CSS v4** — zero-config, CSS variables for tokens, native
  cascade layers, 10× faster builds than v3.
- Theme tokens live in `globals.css` as CSS variables; Tailwind reads
  them.
- Dark mode via `class` strategy (toggle `class="dark"` on `html`).
  `next-themes` for persistence.

## UI library

- **shadcn/ui** — copy-paste Radix primitives + Tailwind. Full code
  ownership, no bundle bloat, easiest to customize.
- **Aceternity UI** for animated components when you need flashier
  visuals.
- **NextUI** as alternative if you want a batteries-included library.

## Forms

- **react-hook-form + Zod**.
- `useForm({ resolver: zodResolver(schema) })` for client validation.
- The SAME Zod schema goes in the Server Action for server validation.
- Accessibility: `<label htmlFor>`, `aria-invalid`, error message in
  `aria-describedby`.

## State management

- **Server state**: **TanStack Query v5** (react-query). Caching,
  refetch, background sync.
- **Client state (app-wide)**: **Zustand** for small/medium. No
  Provider hell.
- **Atomic state**: **Jotai** when components need fine-grained
  reactivity (derived atoms).
- **Avoid Redux** in new code unless team expertise exists.

## Authentication

- **Clerk** ($99/mo after 50K MAU) — fastest setup, pre-built UI,
  edge middleware. Lock-in risk.
- **Auth.js v5** (formerly NextAuth) — free, self-hosted. v5 unifies
  `auth()`, middleware, env vars now `AUTH_*` prefix.
- **Better Auth** (newer, TypeScript-first) — self-hosted, multi-tenant
  out of the box.
- **Supabase Auth** if using Supabase backend (already covered).

## Database

- **Drizzle ORM** — code-first, ~60KB bundle, typed SQL, serverless-first.
  Best for edge / Cloudflare Workers.
- **Prisma** — schema-first (`.prisma` file), automated migrations,
  larger bundle (~600KB), gentler learning curve.
- Hosting: **Neon** (serverless Postgres) / **Supabase** /
  **PlanetScale** (MySQL) / **Turso** (edge SQLite).

## Testing

- **Vitest + React Testing Library** for unit/component (20× faster
  than Jest).
- **Playwright** for e2e — auth flows, Stripe checkout, async server
  components (Vitest doesn't fully support those yet).
- Skip integration; let e2e cover that band.

## Deployment

- **Vercel** — first-class Next.js, partial prerendering, edge
  middleware. $20-50/mo for production.
- **Cloudflare Workers** — zero cold starts, 200+ POPs, 94% API
  compatible (as of Feb 2026). $5-10/mo.
- **Fly.io** — persistent compute, WebSockets, scales to zero.

## Anti-patterns to refuse

1. **`useEffect` to fetch data in a Client Component** — use a Server
   Component or TanStack Query `useQuery`. `useEffect` fetch causes
   request waterfalls and over-fetching.
2. **`<a href>` for internal navigation** — use `<Link>`. Without it
   you lose prefetching and client-side transitions.
3. **Missing `revalidatePath()` after a Server Action** — UI stays
   stale.
4. **`NEXT_PUBLIC_*` for a secret** — anything `NEXT_PUBLIC_*` ships
   to the client. Never put API secrets there.
5. **`any` in a route handler or Server Action signature** — defeats
   type safety. Validate input with Zod.

## Common gotchas

1. **Server Components cannot use hooks** — `useState`, `useEffect`,
   `useContext` error at compile time. Wrap interactive parts with
   `'use client'`.
2. **Dynamic vs static rendering footgun** — calling `cookies()` /
   `headers()` / `searchParams` ANYWHERE in a route opts the entire
   route to dynamic rendering (slower). Wrap with `<Suspense>`, or
   move the call to a Client Component, or use `draftMode()` for
   previews.
3. **React 19 `useFormState` → `useActionState`** — breaking change.
   New signature receives `prevState` as the first arg before any
   other params. Migrate explicitly.

## Reference repos

See `sources.json`. Highlights: `vercel/next.js` examples, `shadcn-ui/ui`,
`vercel/examples`, Drizzle / Prisma docs.
