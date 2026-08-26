# Microsoft Store listing kit

This is the ready-to-paste listing kit for Microsoft Partner Center to ensure a top-tier, professional presence on the Microsoft Store.

## Store Identity

- **Product ID:** `9P2T0QGGHQGQ`
- **Store URL:** https://apps.microsoft.com/detail/9p2t0qgghqgq
- **Package/Identity Name:** `Movena.movena`
- **Package/Identity Publisher:** `CN=835348BD-2CCC-485D-9650-265D1D9D4E15`
- **Publisher display name:** `Movena`

---

## 1. Product Title & Core Metadata

- **App Name / Title:** `Movena - Modern IPTV & VOD Player` *(or `Movena IPTV Player`)*
- **Short Description (100 characters max):**
  ```text
  Fast, private IPTV & VOD desktop player with native libmpv 4K playback, XMLTV EPG, and M3U editor.
  ```
- **Category:** `Entertainment` → `Media players` *(or `Music & video`)*
- **Pricing & Availability:** Free ($0.00), Worldwide distribution
- **Age Rating:** Complete the IARC questionnaire. Movena ships with no media, adult content, or bundled channels (standard General / Everyone rating).
- **Support URL:** https://github.com/movena-app/movena/issues
- **Privacy URL:** https://github.com/movena-app/movena/blob/main/docs/PRIVACY.md
- **Website URL:** https://movena.frtx.cc/
- **License Terms:** GNU General Public License v3.0 (GPL-3.0)

---

## 2. Full Description (Ready to Paste)

```markdown
Movena is a modern, high-performance desktop IPTV and VOD player engineered specifically for Windows. Connect your authorized Xtream Codes accounts or M3U/M3U8 playlists to experience Live TV, movies, and series in a clean, focused, ad-free workspace.

Powered by a native libmpv video core and Windows hardware acceleration, Movena delivers ultra-low latency, smooth 4K/60fps playback, and advanced color controls without the overhead or limitations of browser-based players.

=======================================================
KEY FEATURES
=======================================================

HIGH-PERFORMANCE NATIVE PLAYBACK
• Native libmpv video core with GPU hardware decoding (D3D11VA, NVDEC)
• Advanced HDR-to-SDR tone mapping (BT.2446a, Filmic, Reinhard, Mobius)
• Configurable demuxer cache buffers (50–500 MiB) for instant, stutter-free playback
• Audio/subtitle track selection with millisecond-accurate synchronization offset
• Custom subtitle styling (font size, color, background box, outline, screen position)
• Side-by-Side 3D-to-2D conversion and real-time color adjustment

LIVE TV & ELECTRONIC PROGRAMME GUIDE
• Interactive XMLTV timeline programme guide with now/next indicators
• Automatic stream failover folding duplicate quality tiers (4K, FHD, HD, RAW, HEVC)
• Smart aspect-ratio correction for distorted 16:9 and 4:3 broadcast logos
• Catch-up and archive programme playback where supported by your provider
• Dedicated audio-only player interface for radio channels

CINEMATIC MOVIES & SERIES
• Rich metadata enrichment with localized posters, backdrops, cast, and overview
• Monthly release calendar and live countdowns for upcoming premieres
• Multi-season episode drawer with automatic "Play Next Episode" timer
• IntroDB integration with auto-skip and interactive on-screen skip prompts
• Continue Watching progress tracking and local watch history

INTEGRATED M3U PLAYLIST WORKSPACE
• Dual-mode editor: visual channel table and raw syntax-highlighted editor
• Background stream health probing without leaking connection secrets
• Batch channel title cleaning, category management, and duplicate removal
• Full undo/redo history, local draft recovery, and clean playlist export

PRIVACY & LOCAL SECURITY
• 100% Local: All credentials encrypted in the Windows Credential Locker
• Zero telemetry, zero analytics, zero advertising, and zero tracking
• No project-operated cloud account required; no third-party proxy servers
• Free and open source under GPL-3.0

=======================================================
DISCLAIMER & USAGE POLICY
=======================================================
Movena is strictly a media player application. Movena does not provide, host, bundle, or sell any media, streams, subscriptions, or channel playlists. Users must supply their own authorized content. Movena respects intellectual property and does not bypass DRM or unauthorized access controls.
```

---

## 3. Feature Bullets (Partner Center Listing)

Paste these into the **Features** fields in Partner Center:

1. Native libmpv video playback with GPU hardware acceleration (4K & HDR support)
2. Interactive XMLTV timeline electronic programme guide (EPG) with now/next indicators
3. Multi-source Xtream Codes API and M3U/M3U8 playlist management
4. Built-in M3U playlist editor with syntax highlighting, batch cleaning, and health checks
5. Automatic stream failover folding multiple quality tiers into single channel entries
6. Rich movie and TV series catalogue browsing with cast, director, and episode drawers
7. Live upcoming release calendar with second-by-second premiere countdowns
8. Chapter and IntroDB intro/recap detection with hands-free auto-skip
9. Multi-threaded background download manager with pause and resume support
10. Live broadcast recording directly to the system Downloads folder
11. Full subtitle styling, audio sync adjustment, and custom aspect ratios
12. 100% Private: Local credential vault encryption, zero ads, and zero telemetry

---

## 4. Search Keywords (ASO / Discoverability)

Enter these 7 keywords in the **Search terms** section:

1. `IPTV player`
2. `M3U player`
3. `Xtream Codes`
4. `EPG XMLTV`
5. `VOD player`
6. `4K video player`
7. `libmpv media player`

---

## 5. Store Assets Reference

All assets are generated at exact Microsoft Store specifications using `npm run store:assets` and `npm run store:screenshots`:

| Asset File | Target Resolution | Partner Center Placement | Description |
| :--- | :--- | :--- | :--- |
| `store-assets/BoxArt_1080x1080.png` | 1080 × 1080 (1:1) | **1:1 Box Art** / Square Promo Art | Clean dark canvas with ambient glow, app icon, and Righteous wordmark |
| `store-assets/PosterArt_720x1080.png` | 720 × 1080 (2:3 / 9:16) | **9:16 Poster Art** | Vertical featured poster with framed hero UI capture |
| `store-assets/SuperHeroArt_1920x1080.png` | 1920 × 1080 (16:9) | **16:9 Super Hero Art** | High-res background hero art without title text (Xbox / Windows) |
| `store-assets/AppTile_300x300.png` | 300 × 300 (1:1) | **App Tile Icon** | Centered high-DPI icon with subtle ambient depth |
| `store-assets/Logo_150x150.png` | 150 × 150 (1:1) | **Small Tile Logo** | Clean square logo |
| `store-assets/Logo_71x71.png` | 71 × 71 (1:1) | **Badge Logo** | Scaled notification / taskbar icon |
| `screenshots/01_Home_Dashboard.png` | 1920 × 1080 | **Desktop Screenshots (1)** | Discover hub with favorites & continue watching |
| `screenshots/02_Live_TV_Player.png` | 1920 × 1080 | **Desktop Screenshots (2)** | Live TV player with channel branding |
| `screenshots/03_Electronic_Program_Guide.png` | 1920 × 1080 | **Desktop Screenshots (3)** | Interactive XMLTV timeline schedule & now/next |
| `screenshots/04_Native_libmpv_Player.png` | 1920 × 1080 | **Desktop Screenshots (4)** | 4K VOD player with timeline & chapters |
| `screenshots/05_Series_Player_Episodes.png` | 1920 × 1080 | **Desktop Screenshots (5)** | Series player with episode drawer & skip prompts |
| `screenshots/06_Movie_Details.png` | 1920 × 1080 | **Desktop Screenshots (6)** | Movie detail modal with rich TMDB metadata |
| `screenshots/07_Upcoming_Release_Calendar.png` | 1920 × 1080 | **Desktop Screenshots (7)** | Release calendar with live premiere countdowns |
| `screenshots/08_M3U_Playlist_Workspace.png` | 1920 × 1080 | **Desktop Screenshots (8)** | M3U workspace with stream health verification |
| `screenshots/09_Download_Manager.png` | 1920 × 1080 | **Desktop Screenshots (9)** | Multi-threaded download queue |
| `screenshots/10_Light_Appearance.png` | 1920 × 1080 | **Desktop Screenshots (10)** | Clean light mode appearance |

---

## 6. Submission Steps in Partner Center

1. Navigate to [Microsoft Partner Center](https://partner.microsoft.com/dashboard/apps/overview) and open **Movena**.
2. Start a new submission or edit the existing listing.
3. In **Store listings** → **English (United States)**:
   - Update **Product name** to `Movena - Modern IPTV & VOD Player`.
   - Paste the **Short description**, **Full description**, and **Feature bullets**.
   - Enter the 7 **Search terms**.
4. In **Store logos & screenshots**:
   - Upload `BoxArt_1080x1080.png` under **1:1 Box Art**.
   - Upload `PosterArt_720x1080.png` under **2:3 Poster Art**.
   - Upload `HeroBanner_1920x1080.png` under **16:9 Hero Art** if available.
   - Upload the 10 screenshots from `docs/distribution/screenshots/`.
5. Review the submission and click **Submit to the Store**. Certification updates typically publish within 24–48 hours.

