<p align="center">
  <img src="public/favicon.png" alt="Movena icon" width="96" height="96" />
</p>

<h1 align="center">Movena</h1>

<p align="center">
  A private, cross-platform IPTV and VOD desktop player for Xtream Codes and
  M3U/M3U8 playlists, with XMLTV EPG and native libmpv playback.
</p>

<p align="center">
  <a href="https://github.com/movena-app/movena/releases/latest"><img src="https://img.shields.io/github/v/release/movena-app/movena?display_name=tag&sort=semver&style=flat-square" alt="Latest release"></a>
  <a href="https://github.com/movena-app/movena/actions/workflows/compliance.yml"><img src="https://img.shields.io/github/actions/workflow/status/movena-app/movena/compliance.yml?branch=main&label=verify&style=flat-square" alt="Verify workflow status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--or--later-3b82f6?style=flat-square" alt="GPL-3.0-or-later license"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-58677d?style=flat-square" alt="Windows, macOS, and Linux">
</p>

<p align="center">
  <strong><a href="https://github.com/movena-app/movena/releases/latest">Download</a></strong>
  · <a href="https://movena.frtx.cc/">Website</a>
  · <a href="https://github.com/movena-app/movena/issues">Report an issue</a>
  · <a href="CONTRIBUTING.md">Contribute</a>
</p>

> [!IMPORTANT]
> **Use official sources only.** Movena is a free, open-source player. It does
> not sell or provide subscriptions, channels, playlists, or media. Download it
> only from this repository or the official website.

> [!NOTE]
> Bring your own authorized content. Movena does not bypass DRM; use recording,
> catch-up, and download features only where you have permission.

![Movena Discover view with synthetic movies and Continue Watching content](.github/assets/readme/hero.webp)

## Get started

1. [Download the latest Movena release](https://github.com/movena-app/movena/releases/latest) for your desktop platform.
2. Connect an authorized Xtream Codes account or add a local or remote M3U/M3U8 playlist.
3. Browse Live TV, movies, series, and available programme guide data.

Movena keeps sources separate at the credential boundary while presenting their
enabled channels, catalogues, categories, and guides in one workspace.

## Features

**Sources and playlists**

- Connect multiple Xtream Codes and M3U/M3U8 sources at the same time.
- Load playlists from local files or remote URLs, with scheduled refresh.
- Detect playlist XMLTV metadata or configure a per-source XMLTV override.
- Set source-specific user-agent and referrer headers when required.

**Live TV and programme guide**

- Browse provider or XMLTV guide data with now/next information and a timeline grid.
- Search channels, organize categories, and move between channels without leaving playback.
- Play supported provider and M3U catch-up/archive programmes.
- Use a dedicated audio-only interface for playlist entries marked as radio.

**Movies, series, and discovery**

- Browse VOD catalogues, seasons, episodes, recently added media, and upcoming releases.
- Search across Live TV, movies, and series, then filter and sort large catalogues.
- Enable optional TMDB enrichment for richer movie and series metadata.
- Use TVmaze-backed schedule information for supported upcoming-series views.

**Native playback**

- Play video in-window through native libmpv rather than browser video decoding.
- Open public Twitch live-channel page URLs through the bundled Streamlink 8.5
  resolver. Twitch VODs and clips are not handled by this integration; during
  embedded ad intervals playback waits for the channel stream to resume.
- Use hardware decoding, buffering controls, and automatic playback recovery.
- Switch audio and subtitle tracks; adjust speed, aspect ratio, picture, and subtitle presentation.
- Enter native fullscreen, skip chapter-marked intros, continue to the next episode, and record live streams.

**Library and offline use**

- Save favorites, custom collections, watch history, and Continue Watching progress locally.
- Download supported movies and episodes with queue, pause, resume, retry, and file-reveal controls.
- Keep downloaded files on the device and choose how many transfers run in parallel.

**M3U workspace**

- Edit playlists through structured channel tables or the raw M3U document.
- Batch-clean titles, find and replace values, renumber entries, and manage categories.
- Validate playlist data and test stream health without exposing connection secrets.
- Undo and redo edits, recover local drafts, review changes, export copies, and restore saved versions.

**Privacy and personalization**

- Keep passwords and connection secrets in the operating-system credential vault.
- Use Movena without a project-operated account, advertising, analytics, or telemetry.
- Choose English, German, Spanish, French, Italian, Dutch, Polish, or Brazilian Portuguese.
- Customize accent, catalogue layout, motion, playback, subtitle, picture, and notification settings.
- Export portable preferences without credentials, playlist URLs, history, favorites, or cached media.
- Check for and install signed Movena updater packages from GitHub Releases.

## Product tour

These are captures of Movena's real interface at 1440×900, populated entirely
with fictional titles, geometric project artwork, and reserved example data.
The player images use a synthetic video frame behind the production player
controls because libmpv renders video in a separate native surface. No capture
contains provider accounts, private URLs, third-party channel artwork, or
commercial media.

| Live TV catalogue | Timeline programme guide |
| :---: | :---: |
| ![Movena Live TV catalogue with synthetic news, sports, culture, and radio channels](.github/assets/readme/live-tv.webp) | ![Movena timeline programme guide showing synthetic channels and XMLTV programmes](.github/assets/readme/live-epg.webp) |
| VOD player controls | Live player and now-playing guide |
| ![Movena native VOD player controls with timeline, chapters, playback settings, and fictional movie metadata](.github/assets/readme/player-vod.webp) | ![Movena live player controls showing a fictional channel, current programme, recording, and guide actions](.github/assets/readme/player-live.webp) |
| Movie details and playback actions | Seasons and episode browser |
| ![Movena movie details using fictional content and geometric artwork](.github/assets/readme/library-details.webp) | ![Movena series details with a synthetic programme, season selector, and episode list](.github/assets/readme/series-details.webp) |
| Global library search | M3U workspace |
| ![Movena global search returning synthetic movie and Live TV results](.github/assets/readme/search.webp) | ![Movena M3U editor with synthetic channels, categories, filters, and stream-health status](.github/assets/readme/m3u-editor.webp) |
| Download queue | Source management |
| ![Movena downloads page with fictional movies and episodes](.github/assets/readme/downloads.webp) | ![Movena source settings with a synthetic M3U library](.github/assets/readme/settings.webp) |

<p align="center">
  <strong>Playback configuration</strong><br><br>
  <img src=".github/assets/readme/playback-settings.webp" alt="Movena player and video settings for decoding, buffering, playback behavior, and subtitles" width="720" />
</p>

## Download and platform support

Download the current packages from the
[latest release](https://github.com/movena-app/movena/releases/latest). Release
assets also include a
[SHA-256 checksum file](https://github.com/movena-app/movena/releases/latest/download/SHA256SUMS.txt)
and updater signatures where applicable.

| Platform | Published packages | Important notes |
| --- | --- | --- |
| Windows x64 | NSIS `.exe`, `.msi`, portable `.zip` | libmpv is bundled. Current builds are not Authenticode-signed, so Windows may show a SmartScreen warning. |
| macOS Apple Silicon | `.dmg` | Install the current mpv runtime with `brew install mpv`. Current builds are ad-hoc signed rather than Developer ID notarized. |
| Linux x64 | `.deb`, `.AppImage` | A compatible system libmpv and normal Tauri/WebKit desktop libraries are required. Install `mpv` through your distribution if necessary. |

If installation or playback fails, search the
[existing issues](https://github.com/movena-app/movena/issues) before opening a
new report. Never include credentials, playlist URLs, provider responses, or
real viewing data in an issue.

<details>
<summary><strong>Keyboard shortcuts</strong></summary>

| Area | Shortcut | Action |
| --- | --- | --- |
| Navigation | <kbd>Ctrl/Cmd</kbd> + <kbd>1–5</kbd> | Open Home, Live TV, TV Guide, Movies, or Series |
| Navigation | <kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd> | Open Search |
| Navigation | <kbd>Ctrl/Cmd</kbd> + <kbd>\</kbd> | Collapse or expand the sidebar |
| Help | <kbd>?</kbd> | Show or hide the in-app shortcut guide |
| Playback | <kbd>Space</kbd> or <kbd>K</kbd> | Play or pause |
| Playback | <kbd>F</kbd> | Toggle fullscreen |
| Playback | <kbd>M</kbd> | Mute or restore volume |
| Playback | <kbd>←</kbd> / <kbd>→</kbd> | Seek backward or forward during VOD playback |
| Playback | <kbd>↑</kbd> / <kbd>↓</kbd> | Adjust volume, or change channels when the live drawer is open |
| Playback | <kbd>Esc</kbd> | Close the active player menu, drawer, or player |

</details>

## Technology

| Layer | Technology |
| --- | --- |
| Desktop shell | [Tauri 2](https://tauri.app/) |
| Interface | React, TypeScript, Zustand, and TanStack Query |
| Native core | Rust |
| Playback | [libmpv](https://mpv.io/) |
| Twitch live-page resolution | [Streamlink 8.5](https://streamlink.github.io/) |

React owns presentation and client state; Rust owns native playback,
credential storage, filesystem access, downloads, and native cache/network
operations. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full
boundary and repository map.

## Build from source

You will need Node.js 20.19+, npm, Rust, Python 3.13.11, the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/), and libmpv
development/runtime files.

```bash
git clone https://github.com/movena-app/movena.git
cd movena
npm install
npm run setup:twitch
```

`setup:twitch` creates an architecture-specific bundled resolver from the
hash-pinned Python dependency lock. `npm run dev` also runs this setup before
starting Tauri.

On macOS:

```bash
xcode-select --install
brew install mpv
```

On Windows, install Visual Studio C++ Build Tools and the Windows SDK, then
provision the pinned development copy of mpv:

```powershell
npm run setup:mpv
```

On Linux, install the Tauri prerequisites and your distribution's libmpv
development package. Then start Movena:

```bash
npm run dev
```

## Contributing

Contributions are welcome. Before submitting a change:

```bash
npm run check
npm run licenses:check
```

Every commit needs a DCO sign-off created with `git commit -s`. Please read
[CONTRIBUTING.md](CONTRIBUTING.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) before substantial changes.

## Project information

Movena keeps app data local and operates no media proxy or project account.
Read the [privacy documentation](docs/PRIVACY.md) and
[security policy](SECURITY.md) for data handling and private vulnerability
reporting.

Movena is licensed under [GPL-3.0-or-later](LICENSE). Packaging and distribution
requirements are documented in [docs/RELEASING.md](docs/RELEASING.md).
See [CHANGELOG.md](CHANGELOG.md) for unreleased and tagged product changes.
Third-party notices and asset provenance are in
[docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md),
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt), and
[docs/ASSETS.md](docs/ASSETS.md). See the
[Code of Conduct](CODE_OF_CONDUCT.md) and
[trademark guidance](docs/TRADEMARK.md) for community and branding terms.
