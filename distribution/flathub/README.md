# Flathub preparation

Flathub requires a reverse-DNS application ID, AppStream metadata, a desktop
file, an icon, and a build that can be produced from source. Movena currently
links against platform libmpv and its Linux release uses Tauri/WebKit system
dependencies, so the Flatpak manifest must be tested in a clean builder before
submission.

Suggested ID: `io.github.movena_app.Movena`.

Before opening a Flathub pull request:

1. Write a Flatpak manifest that builds the pinned Rust/Node/native inputs from
   source and does not download prebuilt binaries.
2. Add an AppStream metainfo file and desktop file using the exact ID above.
3. Bundle an icon at least 256×256 and add screenshots that contain no private
   provider data.
4. Build and install with `flatpak-builder` in a clean Linux VM, then exercise
   playback, EPG, playlist editing, and source removal.
