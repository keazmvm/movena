# Third-party notices

Movena is licensed under GPL-3.0-or-later. It incorporates or interfaces with
third-party components under compatible licenses. `package-lock.json` and
`src-tauri/Cargo.lock` identify the exact JavaScript and Rust versions.

Run `npm run licenses:generate` after changing dependencies. It creates
`THIRD_PARTY_LICENSES.txt` from the installed package license files and Cargo
metadata. Release source archives must include that generated file, this notice,
both lockfiles, `LICENSE`, and `public/fonts/OFL.txt`.

Important components include:

- React, Zustand, TanStack Query, Tauri, reqwest, Tokio, serde, and most other
  dependencies: MIT and/or Apache-2.0; see generated notices.
- Mozilla Public License components: MPL-2.0; source-level obligations remain
  with the corresponding components.
- `libmpv-sys`: LGPL-2.1; it provides Rust bindings and does not change the
  license of the linked mpv runtime.
- mpv: GPL-2.0-or-later in the normal build configuration.
- FFmpeg and the pinned Windows mpv build: configuration-dependent. The build
  used by this project enables GPL and version-3 components, so a distribution
  containing that native runtime must comply with GPL-3.0-or-later and include
  complete corresponding native source.
- Righteous font: SIL Open Font License 1.1; see `public/fonts/OFL.txt`.
- Country Flag Icons: MIT; flag designs are derived from public-domain Unicode
  regional indicator data.

Movena does not bundle TMDB or TVmaze data. Runtime responses remain subject to
their respective terms. TVmaze data is offered under CC BY-SA.

