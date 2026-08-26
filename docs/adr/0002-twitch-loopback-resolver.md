# ADR 0002: Twitch loopback resolver ownership

- Status: accepted
- Decision date: 2026-08-26

## Context

Canonical Twitch live-channel pages need provider-specific resolution before
libmpv can load them. Passing resolver output or credentials through frontend
state would enlarge the secret and process-lifecycle boundary.

## Decision

The native player session owns a pinned Streamlink resolver and a random
`127.0.0.1` listener. Only the validated loopback URL reaches libmpv. Resolver
status is reported through typed, redacted events. Playback replacement, app
data deletion, and shutdown disconnect mpv before terminating the complete
resolver process group.

## Consequences

The resolver runtime is platform-specific release material with locked inputs,
license obligations, and explicit teardown tests. Twitch VODs, clips, and
direct HLS URLs stay on the normal playback path.
