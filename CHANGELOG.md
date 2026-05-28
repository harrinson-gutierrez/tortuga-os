# Changelog

All notable changes to Tortuga OS are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2]

### Added

- **Embedded emulator.** Boot, watch, and drive an Android emulator from inside
  Tortuga — no Android Studio round-trips.
  - Emulator lifecycle managed by the sidecar (discover SDK/AVDs, boot with a
    clean snapshot, poll until ready, kill).
  - Interactive H.264 stream over WebSocket, decoded with WebCodecs onto a
    canvas, with pointer + keyboard control fed back to the device (via the
    Tango/scrcpy stack, bundled scrcpy-server v3.3.1).
  - Project-scoped, single-active by design: every task of a project reuses one
    shared emulator, one at a time. When a task starts running, the right
    sidebar auto-boots the emulator and launches the project app onto it.

### Changed

- **Pipeline stability refactor.** Decomposed the two agent-runs god-files into
  focused modules without changing observable behaviour:
  - `runner.ts` split into `prompt/`, `process/` (spawn + stream collector +
    `kill-tree`), `verdict/`, `artifacts/`, `gates/`, and `persistence/`.
  - `watcher.ts` split into pure `eligibility` and `rewind-policy` helpers.

### Fixed

- End-of-run state is now committed in a single transaction (run + task +
  project + step), removing the half-finalized states that required manual
  rescue scripts when the sidecar died mid-write.
- `killProcessTree` on Windows now handles `taskkill` errors and falls back to
  `child.kill()` instead of fire-and-forget, so orphaned agent processes no
  longer linger.
- A successful run with no parseable verdict is treated as a reject (was
  silently approved), so a malformed agent run is retried rather than advanced.

## [0.1.0]

- Initial public release under BUSL-1.1 (converts to Apache 2.0 on 2030-05-28).

[0.1.2]: https://github.com/harrinson-gutierrez/tortuga-os/compare/v0.1.0...v0.1.2
[0.1.0]: https://github.com/harrinson-gutierrez/tortuga-os/releases/tag/v0.1.0
