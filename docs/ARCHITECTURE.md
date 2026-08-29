# Movena architecture

Movena is a desktop Tauri application. React owns presentation and client
state; Rust owns native playback, credentials, filesystem access, and native
network/cache operations.

## Boundaries

```text
React UI
  ├─ Zustand: local UI, player, library, source, and preference state
  ├─ TanStack Query: source-scoped catalog and guide cache
  ├─ src/api/ipc.ts: typed domain command boundary
  └─ src/api/desktop.ts: typed desktop event/window boundary
        │
        ▼
Tauri/Rust
  ├─ native_player.rs: libmpv lifecycle, commands, and events
  ├─ twitch_resolver.rs: Twitch URL routing and resolver process lifecycle
  ├─ window_commands.rs: fullscreen and cursor behavior
  ├─ credentials.rs / source_secrets.rs: operating-system credential vault
  ├─ remote_media.rs / m3u_cache.rs / xmltv.rs: validated remote data and caches
  ├─ downloads.rs / app_files.rs: downloads and allowlisted file operations
  ├─ lib.rs: module registration, app-data deletion, and Tauri wiring
  ├─ macos_embed.rs: macOS mpv child-window integration
  └─ windows_window.rs: Windows frameless window and taskbar integration
```

The frontend never talks to Rust through ad-hoc `invoke` calls. Add domain
commands to `src/api/ipc.ts`, desktop/window and event operations to
`src/api/desktop.ts`, register them in `src-tauri/src/lib.rs`, and test the
wrapper.

## State ownership

- `usePlayerStore`: event-authoritative playback state and active stream.
- `useSourceStore`: M3U profiles, playlist runtimes, and source enablement.
- `useAuthStore`: Xtream profiles, credentials, and provider runtimes.
- `useSettingsStore`: persisted preferences and layout settings.
- `useLibraryStore`: favorites, collections, history, and watch progress.
- `useDownloadStore`: session-only download queue and active/completion state.
- `useNotificationStore`, `useSearchStore`, `useContextMenuStore`, `useDebugStore`, `useStreamVerificationStore`, `useUpdateStore`: focused UI, diagnostic, verification, and updater concerns.
- TanStack Query: remote catalog/detail/EPG data keyed by source identity.

Keep server data in TanStack Query and app interaction state in Zustand. Do not
duplicate query results in a second global store.

### Query conventions

Catalogues are mapped once in `src/api/useCatalog.ts` and shared by Home,
catalog pages, search, and detail flows. Query keys come from
`src/api/queryKeys.ts`; provider-backed keys include an opaque source scope so
switching accounts cannot reuse another account’s cache. Never include a
password or raw provider URL in a query key or diagnostic report.

Categories are filtered through shared visibility rules before they reach a
browsing screen. XMLTV and provider EPG data remain separate query sources and
are selected by source configuration rather than merged ad hoc in pages.

## Playback

Playback is native libmpv. Windows and Linux embed mpv using the main window
handle; macOS adopts a separate mpv-owned surface behind the transparent
webview. Do not replace this with HTML video or a browser-only fallback.

Player commands are asynchronous because mpv teardown can cross the macOS main
queue. Playback state returns through `mpv-event` and diagnostics through the
diagnostic events; commands should not pretend to be authoritative state.

The public playback commands are:

`mpv_start`, `mpv_stop`, `mpv_play_pause`, `mpv_seek`,
`mpv_seek_relative`, `mpv_set_volume`, `mpv_set_speed`,
`mpv_set_audio_track`, `mpv_set_sub_track`, `mpv_set_recording`, and
the allowlisted `mpv_set_property` boundary.

Canonical Twitch live-channel pages take a provider-specific path before
`loadfile`: `twitch_resolver.rs` starts the bundled Streamlink 8.5.0 onedir
runtime, validates its random `127.0.0.1` HTTP endpoint, and gives only that
local URL to libmpv. Streamlink removes Twitch's stitched advertising segments;
Movena represents the resulting unavailable interval with typed
`resolver-status` events. VODs, clips, unrelated Twitch pages, and direct HLS
URLs remain on the ordinary playback path.

The resolver can use an installed Chromium-based browser in headless mode when
Twitch requires a client-integrity token. Streamlink state is redirected into
Movena's application cache; Delete All App Data removes that cache. The local
HTTP listener must bind only to a random `127.0.0.1` port.

The resolver is owned by the same `NativePlayerManager` session as mpv. Stream
replacement and shutdown disconnect mpv first, then stop the complete resolver
process group within a bounded timeout. Resolver output is never passed through
as raw diagnostics, and URL or token fields retained for failure classification
are redacted.

Fullscreen and pointer visibility use `player_set_fullscreen` and
`player_set_cursor_hidden`. Source, settings, cache, and download commands are
also exposed only through `src/api/ipc.ts`; keep their Rust names and camelCase
payload mappings covered by `tests/platform/ipc.test.ts`.

## Sources and credentials

Xtream and M3U sources share the source manager but keep independent profiles,
runtimes, caches, and query keys. Provider passwords and M3U connection secrets
are stored in the operating-system credential vault. Playlist and XMLTV
downloads are size-limited, URL-validated, and cached with conditional HTTP
validators where available.

Media URLs and required stream headers are passed to libmpv only after source
validation. Diagnostics must redact credentials and media URLs.

Settings backups are an allowlisted, versioned JSON format. They may contain
portable preferences and layout settings, but never credentials, source or
guide URLs, playlist headers, history, favorites, diagnostics, or media caches.
Imports validate and sanitize the complete document before one store update.

The Tauri capability file grants the frontend only the required app/event,
window, opener, dialog, updater, and restart permissions. The CSP keeps scripts
self-hosted and disables objects and framing. Images and frontend connections
currently permit broad `https:` and legacy `http:` destinations because users
can configure arbitrary providers; Rust commands still validate remote URLs.
Plain HTTP is accepted when configured but is unencrypted, so HTTPS should be
preferred wherever the source supports it.

## Repository map

```text
src/                 React app, stores, API clients, components, and pages
src-tauri/src/       Rust commands and native playback
src-tauri/capabilities/ Tauri permissions
scripts/             Local checks and pinned native setup
tests/               Frontend and Rust-adjacent regression tests
tests/ui/            Playwright accessibility, geometry, locale, and visual QA
tests/desktop/       Feature-gated WebDriver journeys against the real Tauri binary
docs/adr/            Durable architecture decisions and their consequences
```

`npm run check:dead-code` runs Knip across production modules, tests, UI
harnesses, configuration, and JavaScript build scripts. `npm run check:design`
also rejects orphaned or unused CSS-module selectors, undefined or unused
design tokens, and forbidden style drift. Dynamic CSS-module variants have a
small explicit allowlist in the checker.

The normal frontend build removes only the repository-root `dist/` directory
before Vite runs, then validates every emitted file against the release asset
allowlist. Unexpected media or unrelated extensions fail the build instead of
surviving from an earlier build.

## Verification

```bash
npm run check
npm run build
npm run check:public-tree
```

Push and pull-request CI run through `.github/workflows/compliance.yml`; release
jobs call the same reusable verification workflow before building artifacts.
Native playback still needs manual testing in a real Tauri window: stream
start/stop, seek, fullscreen, track switching, recording, resize, and teardown.
For Twitch, cover startup, pre-roll and mid-roll waiting states, recovery,
replacement, close, resolver-process teardown, and loopback-listener teardown.

`npm run test:desktop:all` compiles a separate `com.movena.desktop.e2e` binary
with an embedded WebDriver and isolated credential-vault service. Production
capabilities explicitly exclude that driver. The journey proves real IPC,
vault/cache writes, and first-run navigation; it does not replace the native
compositing and teardown matrix above.
