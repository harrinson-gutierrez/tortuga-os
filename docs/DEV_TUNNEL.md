# Dev tunnel (`pnpm dev:tunnel`)

Expose the **web** (Vite dev server, port 5173) through an ngrok tunnel so a
visual demo of the front end can be shown from outside your LAN.

> ⚠️ This is a demo tool, **not** a deployment mode. The Hono sidecar
> (`:31415`) is **not** exposed — only the static UI is visible. The backend
> keeps listening on `127.0.0.1` and requires the handshake token, which the
> remote browser **does not** have.

---

## Prerequisites

1. **ngrok installed** on your machine:
   - Windows (winget): `winget install ngrok.ngrok`
   - macOS (brew): `brew install ngrok/ngrok/ngrok`
   - Manual: <https://ngrok.com/download>
2. **Authtoken configured** (free signup at ngrok.com):
   ```sh
   ngrok config add-authtoken <YOUR_TOKEN>
   ```
3. **`concurrently`** is already in the root `devDependencies`, so a
   `pnpm install` leaves it ready.

---

## How to run it

From the monorepo root:

```sh
pnpm dev:tunnel
```

This starts two processes in parallel (with `concurrently --kill-others`):

| Process  | What it does                                                      |
| -------- | ----------------------------------------------------------------- |
| `web`    | `pnpm --filter @tortuga/web dev` — Vite on `http://localhost:5173` |
| `tunnel` | `ngrok http 5173` — opens the public URL                          |

When both come up you'll see something like this in the console:

```
[tunnel]   Forwarding   https://xxxxxxxx.ngrok-free.app -> http://localhost:5173
```

Share that URL with whoever wants to see the demo. Close with `Ctrl+C` and both
processes are killed together (`--kill-others`).

---

## Caveats

- **The UI will be broken** if it tries to talk to the sidecar — the sidecar
  only accepts requests with the handshake token, which the remote browser does
  not have. The typical use is showing static layouts and flows, not live
  functionality.
- A "complete" demo would require exposing the sidecar too and redesigning the
  handshake (e.g. an ephemeral signed token, or SSO). Not trivial, not in scope
  for this utility.
- `ngrok-free.app` rotates the URL on each `pnpm dev:tunnel`. For a stable URL,
  configure a reserved domain in your ngrok account and edit the script to
  `ngrok http --domain=<your-domain>.ngrok.app 5173`.
- **Do not commit your authtoken.** It lives in `~/.config/ngrok/ngrok.yml` (or
  the Windows equivalent). The script does not read it.

---

## If ngrok is not installed

`pnpm dev:tunnel` fails with `command not found: ngrok`. Install it (see
prerequisites) and run again.

---

## Alternatives mentioned (not in scope)

- Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:5173`) — no free
  account, random URLs.
- localtunnel (`npx localtunnel --port 5173`) — zero install, but unstable.

ngrok was kept for stability and for its authtoken account integration.
