<p align="center">
  <img src="public/favicon.png" alt="Movena" width="96" />
</p>

<h1 align="center">Movena</h1>

<p align="center">
  Cross-platform desktop IPTV player for Xtream Codes and M3U playlists.
</p>

<p align="center">
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-orange" alt="Tauri 2"></a>
  <a href="https://mpv.io/"><img src="https://img.shields.io/badge/Playback-libmpv-purple" alt="libmpv"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--or--later-blue" alt="GPL-3.0-or-later"></a>
</p>

Movena is a native desktop player for IPTV and VOD. Connect authorized Xtream
Codes or M3U sources, browse Live TV, movies, and series with guide data and
metadata, and play through native libmpv.

> **Bring your own content.** Movena provides no channels, subscriptions,
> playlists, or media. Use only sources and recording or download features you
> are authorized to use. Movena does not bypass DRM.

## What it does

- Plays media in-window through native libmpv, with track, aspect-ratio, and
  playback controls.
- Connects Xtream accounts and local or remote M3U playlists.
- Organizes Live TV, movies, and series with XMLTV/provider EPG, search,
  favorites, collections, and Continue Watching.
- Stores credentials in the operating-system vault and keeps app data local.

## Get started

Clone the repository using GitHub's **Code** button, then install its
development dependencies:

```bash
cd movena
npm install
```

You will need Node.js 20.19+, npm, Rust with the
[Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/), and
libmpv development/runtime files.

On macOS:

```bash
xcode-select --install
brew install mpv
```

On Windows, install Visual Studio C++ Build Tools and the Windows SDK, then
provision the pinned development copy of mpv:

```bash
npm run setup:mpv
```

Start the app:

```bash
npm run dev
```

## Contribute

Before submitting a change, run:

```bash
npm run check
npm run licenses:check
```

Every commit needs a DCO sign-off (`git commit -s`). Please read
[CONTRIBUTING.md](CONTRIBUTING.md),
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and
[DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) before substantial changes.

## Project information

Movena has no project-operated account, analytics, advertising, telemetry, or
media-proxy service. Read [PRIVACY.md](docs/PRIVACY.md) for data handling and
[SECURITY.md](SECURITY.md) for private vulnerability reporting.

Movena is licensed under [GPL-3.0-or-later](LICENSE). It is currently released
as source only; packaging, signing, and distribution requirements are in
[RELEASING.md](docs/RELEASING.md). Third-party notices and asset licensing are in
[THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md),
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt), and
[ASSETS.md](docs/ASSETS.md). The project code of conduct and trademark guidance are
available in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) and
[TRADEMARK.md](docs/TRADEMARK.md).
