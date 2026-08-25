# Asset provenance and licenses

## Project artwork

The Movena favicon, application icons, mobile icon variants, Windows tiles, and
DMG background stored in `public/` and `src-tauri/` are project artwork from
this repository's contributors. They are distributed under GPL-3.0-or-later
with the application source. The branding rules in `TRADEMARK.md` prevent
misrepresentation but do not withdraw the copyright license.

Files covered include:

- `public/favicon.png` and `public/favicon.svg`
- `src-tauri/icons/**`
- `src-tauri/dmg/background.png` and `src-tauri/dmg/background.svg`

## README showcase artwork

The product screenshots and social-preview image in
`.github/assets/readme/` were created for this repository on 25 August 2026.
They are browser captures of Movena's production React pages, shared
components, CSS modules, and app shell at a 1440×900 viewport. The gallery
includes Discover, Live TV, timeline guide, VOD and live player, movie and
series details, global search, M3U workspace, downloads, sources, and playback
settings. The deterministic fixture in `tests-ui/harness/ReadmeHarness.tsx`
supplies an in-memory M3U playlist, XMLTV guide, library history, download
queue, player state, and track metadata. It uses fictional titles,
project-owned geometric SVG artwork, reserved `.test` identifiers, and
synthetic programme data. It does not contain provider accounts, private URLs,
credentials, third-party channel logos, posters, or commercial media.

The VOD and live player captures render Movena's production `PlayerShell` and
control components. The frame behind those controls is synthetic project
artwork because the native libmpv video layer is a separate operating-system
surface and is not present in a browser capture.

The fixture and rendered PNG/WebP files are project artwork from this
repository's contributors and are distributed under GPL-3.0-or-later with the
application source. `social-preview.png` is a 1280×640 branded composition made
from the real Discover capture and checked-in Righteous wordmark font.
Regenerate it with `npm run readme:social-preview`; the WebP files are the
README product tour.

Do not add screenshots, channel logos, provider logos, posters, video, audio,
or other third-party media without recording the creator, source URL, exact
license, and retrieval date in this file.

## Righteous font

`public/fonts/righteous-latin-400.woff2` is Righteous by Astigmatic (Brian J.
Bonislawsky), obtained from the
[Google Fonts Righteous source](https://github.com/google/fonts/tree/main/ofl/righteous)
on 23 August 2026. It is licensed under the SIL Open Font License 1.1. The
Reserved Font Name is "Righteous". The complete license is in
`public/fonts/OFL.txt`. The checked-in WOFF2 SHA-256 is
`17bb3e21ead29ad20cb4e9ffbfa6eac5dbed184836ae13e5c14cbd6e85ddcce6`.

## External service branding

`public/tmdb-logo.svg` is TMDB's approved "Primary short (blue)" logo,
downloaded from TMDB's official
[Logos & Attribution page](https://www.themoviedb.org/about/logos-attribution)
on 23 August 2026. Its checked-in SHA-256 is
`ea66f5cb3bf6ecf099ddcce41b374103d11ecad1b27615019359e06e20a8f767`.
It is included only to satisfy TMDB attribution and is not offered under the
project's GPL license. TMDB and TVmaze names, logos, and data are not project
artwork. Their use is subject to the applicable service terms and attribution
requirements.
