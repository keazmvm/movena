# Contributing

Contributions are welcome. By contributing, you agree that your contribution is
licensed under GPL-3.0-or-later and that you have the right to submit it.

## Developer Certificate of Origin

Every commit must include a `Signed-off-by` line created with `git commit -s`.
The sign-off certifies the Developer Certificate of Origin 1.1:
<https://developercertificate.org/>.

## Before submitting

1. Do not include provider accounts, playlists, tokens, private URLs,
   copyrighted channel artwork, commercial media, or real viewing data.
2. Add focused tests for behavior changes.
3. Run `npm run check` and `npm run licenses:check`.
4. Document every new dependency or asset and its license.
5. Keep credentials in the OS vault; never persist them in Zustand,
   localStorage, logs, URLs, query keys, diagnostics, fixtures, or screenshots.

See `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `docs/ARCHITECTURE.md` before
making substantial changes.

