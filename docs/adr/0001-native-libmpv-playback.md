# ADR 0001: Native libmpv playback

- Status: accepted
- Decision date: 2026-08-26

## Context

Provider and playlist media commonly needs codecs, tracks, network controls,
and recovery behavior that browser media elements cannot provide consistently
inside a cross-platform desktop webview.

## Decision

Rust owns one native libmpv session. Windows and Linux embed its surface using
the application window handle; macOS maintains a native surface behind the
transparent webview. React sends typed asynchronous commands and treats mpv
events as authoritative state. There is no HTML video fallback.

## Consequences

Playback has a stronger native dependency and requires per-platform manual
verification. Session replacement and shutdown must release surfaces, audio,
resolver processes, listeners, cursor state, and fullscreen state. Automated
renderer tests cannot prove native compositing or teardown, so the release
matrix remains mandatory.
