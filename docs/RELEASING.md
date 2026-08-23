# Release policy

## Release automation

Pushing a matching version tag (`vX.Y.Z`) triggers the automated multi-platform
release workflow (`.github/workflows/release.yml`).

The workflow:
1. Runs full verification across Linux and Windows (`compliance.yml`).
2. Builds source archives (`.tar.gz` and `.zip`).
3. Builds Windows installers (NSIS `.exe`, `.msi`) and portable archive (`.zip`).
4. Builds macOS bundles (`.dmg` and `.app.tar.gz`).
5. Builds Linux packages (`.deb` and `.AppImage`).
6. Generates `SHA256SUMS.txt` for all release artifacts and publishes the GitHub release.

## Release checklist

1. Work from a clean tree and a reviewed `vX.Y.Z` tag whose version matches
   `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json`.
2. Run `npm ci`, `npm run licenses:generate`, `npm run licenses:check`, and
   `npm run check`.
3. Run secret scanning and verify that no playlists, provider records,
   credentials, private URLs, diagnostics, recordings, downloads, or
   third-party media exist anywhere in the public history.
4. Include `LICENSE`, all policy files, both lockfiles,
   `THIRD_PARTY_LICENSES.txt`, font licenses, and build scripts.
5. Create and push the Git tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Future binary releases

A binary release requires all source-release checks plus:

1. A manifest for every native binary with exact version, upstream source URL,
   archive checksum, license, patches, build configuration, compiler/toolchain,
   and reproducible build command.
2. Complete corresponding source for Movena, mpv, FFmpeg, and every compiled
   native dependency, delivered from the same release location for at least as
   long as the binaries are offered.
3. `THIRD_PARTY_LICENSES.txt`, attribution, and corresponding-source links in
   the installer and About screen.
4. A documented codec-patent distribution decision for every target country.
5. Authenticode signing for Windows. macOS builds must sign every nested native
   library with Developer ID, use hardened runtime, be notarized, and be
   stapled. Ad-hoc-signed or Homebrew-dependent bundles are not official builds.

The Mac App Store is not an initial distribution target because media download
and recording features create additional store-policy constraints.

## History sanitation

The private development history previously contained non-project commercial
media. Do not expose that history. Publish a clean source history or perform a
reviewed history rewrite before changing repository visibility. History
rewriting must only happen after all uncommitted work is safely preserved and
all collaborators have coordinated the migration.
