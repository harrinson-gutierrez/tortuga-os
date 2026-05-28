# Evidence dossier — contract

> Stack-agnostic contract that every Tortuga task must produce to be closed.
> Lives at `tortuga-projects/<PROJ>/03-tareas/T-xxx/evidence/`.

## Why this exists

Without machine-readable evidence the sidecar cannot decide if a task is done.
Agent prose is not evidence. Exit codes and diffs are evidence.

## Folder shape (mandatory)

```
03-tareas/T-xxx/
├── dev-notes.md                  # free-form notes (already exists)
├── files-declared.txt            # written by the builder agent BEFORE coding
└── evidence/
    ├── gates.json                # the only file the closer reads
    ├── analyze.log               # G1 raw output
    ├── build.log                 # G3 raw output
    ├── tests.log                 # optional, written if tests ran
    ├── boot.log                  # G4 — server/app boot output
    ├── files-changed.txt         # G6 — actual git diff filenames
    ├── screens/                  # G5 — captured at runtime
    │   ├── mobile.png
    │   ├── tablet.png
    │   └── desktop.png
    └── figma-diff.md             # G5 — §3.2 exhaustive checklist
```

Rules:

- The folder is **created by the verifier agent**, not the builder.
- The builder writes `files-declared.txt` (one path per line, relative to repo
  root) BEFORE editing code. This is the source of truth for G6.
- Logs are raw stdout+stderr concatenated. No filtering. No "interesting
  parts." The verifier writes them; humans grep them.
- `gates.json` is the only structured file. Everything else is human-readable
  artifacts.

## gates.json schema

```json
{
  "task": "T-001",
  "project": "TURTLE",
  "stack": "flutter",
  "verifierVersion": "1.0.0",
  "startedAt": "2026-05-25T14:32:00Z",
  "finishedAt": "2026-05-25T14:34:12Z",
  "gates": {
    "G1": {
      "name": "analyze",
      "status": "pass",
      "command": "flutter analyze --no-pub",
      "exitCode": 0,
      "logPath": "evidence/analyze.log",
      "durationMs": 4231
    },
    "G3": {
      "name": "build",
      "status": "pass",
      "command": "flutter build apk --debug --dart-define-from-file=env/dev.json",
      "exitCode": 0,
      "logPath": "evidence/build.log",
      "durationMs": 92140
    },
    "G6": {
      "name": "real-work",
      "status": "fail",
      "reason": "Declared 3 files, changed 1. Missing: lib/screens/login.dart, lib/blocs/auth_bloc.dart",
      "declared": ["lib/screens/login.dart", "lib/blocs/auth_bloc.dart", "lib/main.dart"],
      "changed": ["lib/main.dart"],
      "logPath": "evidence/files-changed.txt"
    },
    "G4": { "status": "skipped", "reason": "not requested in v1" },
    "G5": { "status": "skipped", "reason": "not requested in v1" },
    "G7": { "status": "skipped", "reason": "not requested in v1" }
  },
  "verdict": "reject",
  "rejectReason": "G6 failed",
  "retryHint": "Builder declared files it never created. Re-run builder with strict file-output mode."
}
```

### Status values

- `pass` — gate ran and exit code matches expectation.
- `fail` — gate ran and exit code or check did not match. `reason` required.
- `skipped` — gate not in v1 scope or explicitly opted out. `reason` required.
- `error` — the gate itself crashed (timeout, missing tool). `reason` required.
  Treated as fail for verdict purposes but distinguishable for triage.

### Verdict computation

```
verdict =
  "approve" if every non-skipped gate is pass
  "reject"  otherwise
```

The agent has no vote. Its `dev-notes.md` summary may inform the operator but
**cannot upgrade** a `reject` to `approve`. It can downgrade an `approve` to
`reject` only by adding an explicit `agentOverride: { gate, reason }` block —
this is the only way the agent can be more conservative than the gates.

## Retry contract

When `verdict === "reject"`, the closer calls back into the family's builder
agent with:

- The task spec (unchanged).
- The full `gates.json`.
- The relevant `*.log` excerpts (truncated to 8KB per gate).
- An explicit instruction: "Fix the gates that failed. Do not touch anything
  unrelated. Re-write `files-declared.txt` if your scope changes."

After N retries (default 3) the closer escalates to the operator with a
written summary. N is configurable in `tortuga.config.json`.

## Per-stack gate commands (v1)

### Flutter

| Gate | Command |
|---|---|
| G1 | `flutter analyze --no-pub` |
| G3 | `flutter build apk --debug --dart-define-from-file=env/dev.json` |
| G6 | `git diff --name-only HEAD~1 HEAD` (or staged diff if no commit yet) |

### Web (Next.js / Vite / Angular)

| Gate | Command |
|---|---|
| G1 | `pnpm typecheck && pnpm lint` (or `npm`/`yarn` equivalents) |
| G3 | `pnpm build` |
| G6 | `git diff --name-only HEAD~1 HEAD` |

The verifier picks the command set by reading `project.yml#stack`. Unknown
stacks → `error` with reason `unsupported-stack: <name>`.

## What is NOT in v1

- G2 architectural lint (custom rules) — needs ruleset per stack first.
- G4 boot/healthcheck — needs emulator/server orchestration; next iteration.
- G5 Figma fidelity — needs `tortuga-figma-fidelity` agent + Playwright setup.
- G7 accessibility — needs axe-core + textScale harness.

These slots already exist in `gates.json` with `status: "skipped"` so the
schema does not change when they come online.
