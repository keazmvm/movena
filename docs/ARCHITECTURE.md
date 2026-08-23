# Movena architecture

Movena is a desktop Tauri application. React owns presentation and client
state; Rust owns native playback, credentials, filesystem access, and native
network/cache operations.

## Boundaries

```text
React UI
  ├─ Zustand: local UI, player, library, source, and preference state
  ├─ TanStack Query: source-scoped catalog and guide cache
  └─ src/api/ipc.ts: typed Tauri command boundary
        │
        ▼
Tauri/Rust
  ├─ native_player.rs: libmpv lifecycle, commands, and events
  ├─ window_commands.rs: fullscreen and cursor behavior
  ├─ credentials.rs: operating-system credential vault
  ├─ lib.rs: source loading, downloads, XMLTV, and app wiring
  └─ macos_embed.rs: macOS mpv child-window integration
```

The frontend never talks to Rust through ad-hoc `invoke` calls. Add commands to
the typed wrapper in `src/api/ipc.ts`, register them in `src-tauri/src/lib.rs`,
and test the wrapper.

## State ownership

- `usePlayerStore`: event-authoritative playback state and active stream.
- `useSourceStore`: M3U profiles, playlist runtimes, and source enablement.
- `useAuthStore`: Xtream profiles, credentials, and provider runtimes.
- `useSettingsStore`: persisted preferences and layout settings.
- `useLibraryStore`: favorites, collections, history, and watch progress.
- `useDownloadStore`: download queue, active media downloads, and completion state.
- `useNotificationStore`, `useSearchStore`, `useContextMenuStore`, `useDebugStore`: focused UI and diagnostic concerns.
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
`mpv_command`.

Fullscreen and pointer visibility use `player_set_fullscreen` and
`player_set_cursor_hidden`. Source, settings, cache, and download commands are
also exposed only through `src/api/ipc.ts`; keep their Rust names and camelCase
payload mappings covered by `tests/ipc.test.ts`.

## Sources and credentials

Xtream and M3U sources share the source manager but keep independent profiles,
runtimes, caches, and query keys. Provider passwords and M3U connection secrets
are stored in the operating-system credential vault. Playlist and XMLTV
downloads are size-limited, URL-validated, and cached with conditional HTTP
validators where available.

Media URLs and required stream headers are passed to libmpv only after source
validation. Diagnostics must redact credentials and media URLs.

Settings backups are an allowlisted, versioned JSON format. They may contain
preferences and layout settings, but never credentials, source connections,
playlist headers, history, favorites, diagnostics, or media caches. Imports
validate and sanitize the complete document before one store update.

The Tauri capability file grants only shell APIs used by the frontend. The CSP
allows the provider/TMDB network paths required by the current architecture
while keeping objects and framing disabled.

## Repository map

```text
src/                 React app, stores, API clients, components, and pages
src-tauri/src/       Rust commands and native playback
src-tauri/capabilities/ Tauri permissions
scripts/             Local checks and pinned native setup
tests/               Frontend and Rust-adjacent regression tests
```

## Verification

```bash
npm run check
npm run build
```

Push CI is intentionally disabled. Native playback still needs manual testing
in a real Tauri window: stream start/stop, seek, fullscreen, track switching,
recording, resize, and teardown.
