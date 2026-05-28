# Release & signed updates

Tortuga OS ships as a Tauri-bundled native installer. Updates are
delivered via Tauri's built-in updater with **Ed25519 signature
verification** so a compromised release host cannot push a malicious
binary to an already-installed copy.

This document is the operator runbook for cutting a release.

---

## 1. One-time setup

### 1.1 Generate the signing key pair

```bash
pnpm dlx @tauri-apps/cli signer generate -w ~/.tortuga/updater.key
```

Two files appear:

- `~/.tortuga/updater.key` — **PRIVATE key**. NEVER commit. Keep it in
  a password manager and on the release machine only.
- `~/.tortuga/updater.key.pub` — public key. Goes into
  `tauri.conf.json` → `plugins.updater.pubkey`.

When prompted, the CLI asks for a password to encrypt the private key.
Pick a strong one and store it separately. Without the password the
private key file is useless.

### 1.2 Wire the public key

Open `apps/desktop/src-tauri/tauri.conf.json` and replace the
`REPLACE_WITH_REAL_ED25519_PUBKEY` placeholder with the contents of
`updater.key.pub`. Commit. From this commit on, every installed copy
will only accept updates signed by the matching private key.

### 1.3 Configure the release host

The updater fetches a manifest from the URL in
`plugins.updater.endpoints`. The default points at GitHub Releases:

```
https://github.com/harrinson-gutierrez/tortuga-os/releases/latest/download/latest.json
```

Change to your release distribution host (your own server, S3, etc.)
if you don't use GitHub releases. The host must serve TWO files per
release:

- `<bundle>.<ext>` — the actual installer
- `<bundle>.<ext>.sig` — the Ed25519 signature of that installer

Tauri produces both during `pnpm tauri build` when
`bundle.createUpdaterArtifacts: true` and the `TAURI_SIGNING_PRIVATE_KEY`
env var is set.

---

## 2. Cutting a release

### 2.1 Bump the version

Update `version` in `apps/desktop/src-tauri/tauri.conf.json`,
`apps/desktop/src-tauri/Cargo.toml`, and `apps/desktop/package.json`.
Commit + tag.

### 2.2 Build signed artifacts

On the release machine (with the private key available):

```bash
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tortuga/updater.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD='your-password'

pnpm --filter @tortuga/desktop build
```

Artifacts land in
`apps/desktop/src-tauri/target/release/bundle/<format>/`. Each one has
a `.sig` file alongside it.

### 2.3 Build the manifest

`latest.json` shape Tauri expects:

```json
{
  "version": "0.1.1",
  "notes": "What changed in this release.",
  "pub_date": "2026-05-27T18:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of the .sig file>",
      "url": "https://github.com/.../Tortuga.OS_0.1.1_x64-setup.exe"
    },
    "darwin-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../Tortuga.OS_0.1.1_x64.dmg"
    },
    "linux-x86_64": {
      "signature": "...",
      "url": "https://github.com/.../tortuga-os_0.1.1_amd64.AppImage"
    }
  }
}
```

A helper script can be added at `scripts/build-manifest.mjs` later —
for now build it by hand from the artifacts you actually ship.

### 2.4 Upload

Upload `latest.json`, each installer and each `.sig` to the host. For
GitHub: attach them to the GitHub release matching the tag.

---

## 3. What installed users see

The Tauri updater plugin runs on app startup. If `latest.json` reports
a newer `version` AND the signature against the public key verifies,
the operator gets a native prompt:

> A new version of Tortuga OS (0.1.1) is available. Install now?

`installMode: "passive"` (set in `tauri.conf.json`) means the install
runs without further dialogs once the operator clicks "Install".

If the signature does NOT verify, the update is rejected silently and
logged. The current version keeps running. This is the protection
against a compromised release host.

---

## 4. Automated path (preferred)

Both helpers are wired:

- `scripts/build-manifest.mjs` — reads the Tauri bundle dir, picks the
  matching installer + `.sig` for each platform pattern, and writes
  `latest.json` next to the bundles. Honors
  `TORTUGA_RELEASE_URL_BASE` to point the manifest at the host that
  will actually serve the binaries.
- `.github/workflows/release.yml` — fires on `v*.*.*` tag push. Builds
  signed bundles in parallel on `windows-latest`, `macos-latest`, and
  `ubuntu-22.04`, runs `build-manifest.mjs`, and uploads the
  installers + `.sig` files + `latest.json` to the matching GitHub
  Release.

To cut a release with the workflow:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The two required repo secrets are `TAURI_SIGNING_PRIVATE_KEY` (the
contents of `~/.tortuga/updater.key`) and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## 5. Open items

- [ ] **Code signing** — the updater signature verifies the binary is
      authentic, but on Windows the installer itself still triggers a
      SmartScreen warning on first run because the .exe isn't signed
      with an Authenticode certificate. Buy an EV cert from
      DigiCert/Sectigo when budget allows; then add
      `WINDOWS_CERT_PFX_BASE64` + `WINDOWS_CERT_PASSWORD` secrets and
      a `signtool` step before the upload-artifact step in the
      Windows job of `release.yml`.
- [ ] macOS notarization (Apple Developer ID + `xcrun notarytool`)
      when shipping macOS builds.
- [ ] Replace the `REPLACE_WITH_REAL_ED25519_PUBKEY` placeholder in
      `apps/desktop/src-tauri/tauri.conf.json` with your real pubkey
      after running `pnpm dlx @tauri-apps/cli signer generate -w
      ~/.tortuga/updater.key`. Until you do, the updater plugin will
      refuse to verify ANY incoming update.
