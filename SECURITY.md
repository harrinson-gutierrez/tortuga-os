# Security policy — Tortuga OS

Tortuga OS is a private, proprietary project. If you find a security issue,
please report it privately.

## How to report

- Open a private security advisory:
  https://github.com/harrinson-gutierrez/tortuga-os/security/advisories/new
- Or email: `hgutieco@gmail.com`
- Do **not** open a public issue describing the vulnerability.
- Do **not** run DoS attacks or test against systems you do not own.

Please include:

- A clear description of the issue and its impact.
- Minimal reproduction steps.
- Affected version / commit hash.
- Relevant environment (OS, Node version, Tauri version).

## Scope

In scope: code in this repository (`apps/*`, `packages/*`) and the default
security configuration (Tauri capabilities, CSP, CORS, input validation).

Out of scope: vulnerabilities in upstream dependencies (report them upstream),
and misconfigured self-hosted instances.

## Supported versions

Tortuga OS is pre-1.0 (`0.x`). Only `main` and the latest `0.x.y` release
receive security fixes.
