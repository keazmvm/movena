# Microsoft Store listing kit

This is the ready-to-paste listing for a future Microsoft Store submission. The
package is built by `scripts/make-msix.ps1` with the reserved Store identity
below.

## Reserved app identity

- **Package/Identity Name:** `Movena.movena`
- **Package/Identity Publisher:** `CN=835348BD-2CCC-485D-9650-265D1D9D4E15`
- **Publisher display name:** `Movena`
- **Store ID:** `9P2T0QGGHQGQ`

## Listing fields

- **Suggested name:** Movena IPTV Player
- **Short description:** Free, open-source IPTV player for Xtream Codes and M3U playlists.
- **Category:** Music, video, and entertainment → Media players
- **Price:** Free
- **Age rating:** Complete the IARC questionnaire accurately. Movena ships no channels, subscriptions, or media.
- **Support URL:** https://github.com/movena-app/movena/issues
- **Privacy URL:** https://github.com/movena-app/movena/blob/main/docs/PRIVACY.md
- **Website:** https://movena.frtx.cc/

### Full description

Movena is a free, open-source desktop IPTV and VOD player for Windows. Bring
your own authorized Xtream Codes account or M3U/M3U8 playlist and keep your
library in one focused workspace.

Movena supports native libmpv playback, Live TV, movies, series, XMLTV EPG
programme guides, catch-up where the source provides it, and a built-in M3U
playlist editor. Credentials and local settings stay on your device; Movena
does not operate a media proxy, sell subscriptions, bundle channels, or require
a project account.

Use only content you are authorized to access. Movena does not bypass DRM.

### Feature bullets

- Xtream Codes and M3U/M3U8 playlist support
- XMLTV EPG with now/next and timeline views
- Native libmpv playback with hardware decoding options
- Live TV, movies, series, catch-up, and radio workflows
- Built-in M3U editor with filtering and stream health checks
- Multiple sources with local credential storage
- Free, open source, and available for Windows, macOS, and Linux

## Package checklist

1. Reserve the final display name in Partner Center.
2. Run the manually triggered `Build Microsoft Store package` workflow. Its
   defaults already match the reserved app identity; only use the
   `identity_name` or `publisher` inputs if Microsoft changes those values.
3. Validate the generated `.msix` with Windows App Certification Kit.
4. Upload the unsigned package to Partner Center; the Store re-signs packages
   during certification. Do not claim Store certification before approval.
5. Add 5–8 clear screenshots per device type. Use the supplied README captures
   only after confirming they contain no private provider data.
6. Submit the listing for certification and review the certification report.

The package currently requests `internetClient` and `runFullTrust` because it is
a native Tauri/libmpv desktop application. Store certification, publisher
identity, tax/legal details, and the final submit action require the account
owner in Partner Center.
