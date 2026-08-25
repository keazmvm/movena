/* eslint-disable react-refresh/only-export-components -- screenshot routes share their typed registry with the harness entrypoint */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { MemoryRouter } from 'react-router-dom';
import { getM3uSeriesId, type M3uEntry, type M3uPlaylist } from '../../src/api/m3u';
import { getCombinedSourceQueryScope, getM3uQueryScope, getUrlQueryScope } from '../../src/api/queryKeys';
import { desktopApi } from '../../src/api/desktop';
import { tauriApi } from '../../src/api/ipc';
import type { EpgProgramme } from '../../src/api/useEpg';
import type { XmltvGuide } from '../../src/api/xmltv';
import { Sidebar } from '../../src/components/layout/Sidebar';
import { WindowChrome } from '../../src/components/layout/WindowChrome';
import { PageTransition } from '../../src/components/layout/PageTransition';
import { M3uMovieDetailModal } from '../../src/components/modals/M3uMovieDetailModal';
import { M3uSeriesDetailModal } from '../../src/components/modals/M3uSeriesDetailModal';
import { M3uEditor } from '../../src/components/m3u-editor/M3uEditor';
import { PlayerShell } from '../../src/components/player/PlayerShell';
import { Downloads } from '../../src/pages/Downloads';
import { Epg } from '../../src/pages/Epg';
import { Home } from '../../src/pages/Home';
import { LiveTV } from '../../src/pages/LiveTV';
import { Movies } from '../../src/pages/Movies';
import { Search } from '../../src/pages/Search';
import { Series } from '../../src/pages/Series';
import { Settings } from '../../src/pages/Settings';
import { useDownloadStore } from '../../src/store/useDownloadStore';
import { useLibraryStore } from '../../src/store/useLibraryStore';
import { usePlayerStore } from '../../src/store/usePlayerStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { useSourceStore, type M3uSourceProfile } from '../../src/store/useSourceStore';
import type { DownloadJob } from '../../src/utils/downloads';
import appStyles from '../../src/App.module.css';

export const README_SURFACES = [
  'hero',
  'live-tv',
  'live-epg',
  'player-vod',
  'player-live',
  'library-details',
  'series-details',
  'search',
  'm3u-editor',
  'downloads',
  'settings',
  'playback-settings',
] as const;

export type ReadmeSurface = (typeof README_SURFACES)[number];

const SOURCE_ID = 'm3u-readme-fixture';
const GUIDE_URL = 'https://guide.example.test/movena.xml';

function installPlayerFixtureStubs() {
  desktopApi.isDesktop = () => false;
  desktopApi.onPointerMoved = async () => () => undefined;
  tauriApi.mpvStart = async () => undefined;
  tauriApi.mpvStop = async () => undefined;
  tauriApi.mpvPlayPause = async () => undefined;
  tauriApi.mpvSeek = async () => undefined;
  tauriApi.mpvSeekRelative = async () => undefined;
  tauriApi.mpvSetVolume = async () => undefined;
  tauriApi.mpvSetSpeed = async () => undefined;
  tauriApi.mpvSetAudioTrack = async () => undefined;
  tauriApi.mpvSetSubTrack = async () => undefined;
  tauriApi.mpvSetRecording = async () => undefined;
  tauriApi.mpvSetProperty = async () => undefined;
  tauriApi.playerSetFullscreen = async (on) => on;
  tauriApi.playerSetCursorHidden = async (hidden) => hidden;
}

function artwork(seed: number, wide = false): string {
  const palettes = [
    ['#19263d', '#5978a6', '#d7c6a1'],
    ['#291f35', '#7b5a8f', '#dfb586'],
    ['#153133', '#4e8984', '#d2d39b'],
    ['#33251f', '#a2644f', '#e2c69d'],
    ['#202d25', '#648262', '#d7c1a5'],
    ['#24243a', '#5e6aa0', '#bea8d5'],
  ];
  const [background, accent, highlight] = palettes[seed % palettes.length]!;
  const width = wide ? 480 : 300;
  const height = wide ? 270 : 450;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${background}"/><stop offset="1" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#g)"/>
      <circle cx="${width * 0.72}" cy="${height * 0.24}" r="${height * 0.12}" fill="${highlight}" opacity=".82"/>
      <path d="M0 ${height * 0.72} L${width * 0.28} ${height * 0.42} L${width * 0.5} ${height * 0.68} L${width * 0.76} ${height * 0.34} L${width} ${height * 0.58} V${height} H0Z" fill="${background}" opacity=".78"/>
      <path d="M0 ${height * 0.86} Q${width * 0.38} ${height * 0.65} ${width} ${height * 0.82} V${height} H0Z" fill="#0d1118" opacity=".62"/>
      <g fill="none" stroke="${highlight}" opacity=".28">
        <path d="M${width * 0.08} ${height * 0.12} H${width * 0.48}"/>
        <path d="M${width * 0.12} ${height * 0.17} H${width * 0.38}"/>
      </g>
    </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const now = Date.now();

function entry(
  id: string,
  title: string,
  type: M3uEntry['type'],
  groupTitle: string,
  seed: number,
  extras: Partial<M3uEntry> = {},
): M3uEntry {
  return {
    id,
    sourceId: SOURCE_ID,
    title,
    url: `https://media.example.test/${type}/${id}.${type === 'live' ? 'm3u8' : 'mp4'}`,
    type,
    duration: type === 'live' ? -1 : 6_900,
    groupTitle,
    categoryId: `${type}-${groupTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    logo: artwork(seed, type === 'live'),
    headers: {},
    ...extras,
  };
}

const MOVIES: M3uEntry[] = [
  entry('movie-atlas', 'Atlas Station', 'vod', 'Science Fiction', 0, { year: '2026', rating: 8.6, description: 'A cartographer follows an impossible signal through a station drifting beyond the mapped sky.' }),
  entry('movie-quiet-sea', 'Across the Quiet Sea', 'vod', 'Drama', 1, { year: '2025', rating: 8.1, description: 'Two estranged friends take the last ferry north and discover how much can change before landfall.' }),
  entry('movie-glass-orchard', 'The Glass Orchard', 'vod', 'Mystery', 2, { year: '2026', rating: 7.9, description: 'A botanist finds a greenhouse where every reflection shows a different season.' }),
  entry('movie-signal-hill', 'Signal Hill', 'vod', 'Thriller', 3, { year: '2024', rating: 7.7, description: 'A night operator hears a broadcast from a transmitter that has been silent for decades.' }),
  entry('movie-paper-moons', 'Paper Moons', 'vod', 'Adventure', 4, { year: '2025', rating: 8.3, description: 'A handmade map turns an ordinary summer into a journey across hidden city rooftops.' }),
  entry('movie-last-light', 'Last Light at Meridian', 'vod', 'Drama', 5, { year: '2026', rating: 8.0, description: 'The keepers of a remote observatory prepare for one final night beneath the stars.' }),
  entry('movie-windward', 'Windward', 'vod', 'Adventure', 2, { year: '2024', rating: 7.6 }),
  entry('movie-blue-hour', 'The Blue Hour', 'vod', 'Mystery', 0, { year: '2025', rating: 7.8 }),
];

const SERIES: M3uEntry[] = [
  entry('series-northstar-s1e1', 'Northstar Files S01E01 - The Arrival', 'series', 'Drama Series', 5, { rating: 8.8, year: '2026', description: 'A research crew receives a signal from beyond the charted system.', episode: { seriesTitle: 'Northstar Files', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'The Arrival' } }),
  entry('series-northstar-s1e2', 'Northstar Files S01E02 - Dark Orbit', 'series', 'Drama Series', 0, { rating: 8.8, year: '2026', description: 'The crew follows the signal into the shadow of a silent moon.', episode: { seriesTitle: 'Northstar Files', seasonNumber: 1, episodeNumber: 2, episodeTitle: 'Dark Orbit' } }),
  entry('series-northstar-s1e3', 'Northstar Files S01E03 - The Cartographer', 'series', 'Drama Series', 2, { rating: 8.8, year: '2026', description: 'An unfamiliar map redraws every route home.', episode: { seriesTitle: 'Northstar Files', seasonNumber: 1, episodeNumber: 3, episodeTitle: 'The Cartographer' } }),
  entry('series-northstar-s2e1', 'Northstar Files S02E01 - New Meridian', 'series', 'Drama Series', 4, { rating: 8.8, year: '2026', description: 'Months later, a second transmission changes the mission.', episode: { seriesTitle: 'Northstar Files', seasonNumber: 2, episodeNumber: 1, episodeTitle: 'New Meridian' } }),
  entry('series-signal-room-s1e1', 'The Signal Room S01E01 - Static', 'series', 'Mystery Series', 3, { rating: 8.4, year: '2025', episode: { seriesTitle: 'The Signal Room', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'Static' } }),
  entry('series-common-ground-s1e1', 'Common Ground S01E01 - New Roots', 'series', 'Documentary', 4, { rating: 8.0, year: '2025', episode: { seriesTitle: 'Common Ground', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'New Roots' } }),
  entry('series-night-lines-s2e1', 'Night Lines S02E01 - Junction', 'series', 'Crime Series', 1, { rating: 8.2, year: '2026', episode: { seriesTitle: 'Night Lines', seasonNumber: 2, episodeNumber: 1, episodeTitle: 'Junction' } }),
  entry('series-field-notes-s1e1', 'Field Notes S01E01 - Coast', 'series', 'Documentary', 2, { rating: 7.9, year: '2024', episode: { seriesTitle: 'Field Notes', seasonNumber: 1, episodeNumber: 1, episodeTitle: 'Coast' } }),
];

const LIVE: M3uEntry[] = [
  entry('live-horizon', 'Horizon News', 'live', 'News', 0, { tvgId: 'horizon.news', channelNumber: '101', catchup: 'append', catchupDays: 7 }),
  entry('live-field', 'Field & Forest', 'live', 'Documentary', 2, { tvgId: 'field.forest', channelNumber: '112' }),
  entry('live-studio', 'Studio One', 'live', 'Entertainment', 1, { tvgId: 'studio.one', channelNumber: '120', catchup: 'append', catchupDays: 3 }),
  entry('live-atlas', 'Atlas Sports', 'live', 'Sports', 3, { tvgId: 'atlas.sports', channelNumber: '131' }),
  entry('live-classic', 'Classic Cinema', 'live', 'Movies', 4, { tvgId: 'classic.cinema', channelNumber: '142' }),
  entry('live-pulse', 'Pulse Radio', 'live', 'Radio', 5, { tvgId: 'pulse.radio', channelNumber: '151', radio: true, radioMetadata: { title: 'Pulse Radio', artist: 'Movena Sessions', genre: 'Electronic' } }),
  entry('live-kids', 'Little Comet', 'live', 'Family', 0, { tvgId: 'little.comet', channelNumber: '161' }),
  entry('live-world', 'World Window', 'live', 'Travel', 2, { tvgId: 'world.window', channelNumber: '172' }),
];

const PLAYLIST: M3uPlaylist = {
  name: 'Demo Library',
  epgUrls: [GUIDE_URL],
  warnings: [],
  entries: [...MOVIES, ...SERIES, ...LIVE],
};

const PROFILE: M3uSourceProfile = {
  id: SOURCE_ID,
  kind: 'm3u',
  name: 'Demo Library',
  locationType: 'remote',
  locationLabel: 'playlist.example.test',
  refreshIntervalMinutes: 360,
  lastRefreshAt: now - 8 * 60_000,
  entryCount: PLAYLIST.entries.length,
  liveCount: LIVE.length,
  vodCount: MOVIES.length,
  seriesCount: SERIES.length,
  hasEpg: true,
};

function programme(id: string, title: string, startMinutes: number, durationMinutes = 60): EpgProgramme {
  const anchor = new Date(now);
  anchor.setMinutes(0, 0, 0);
  const start = anchor.getTime() + startMinutes * 60_000;
  return { id, title, description: `${title} on the synthetic Movena demo guide.`, start, end: start + durationMinutes * 60_000 };
}

function guide(): XmltvGuide {
  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  const schedules = [
    ['horizon.news', ['Morning Brief', 'The Daily Desk', 'World Report', 'Market Close']],
    ['field.forest', ['River Country', 'Wild Neighbours', 'Open Skies', 'Forest at Dusk']],
    ['studio.one', ['First Take', 'Kitchen Stories', 'The Studio Hour', 'Late Session']],
    ['atlas.sports', ['Matchday Live', 'Courtside', 'The Final Lap', 'Sports Desk']],
    ['classic.cinema', ['Silver Roads', 'Harbour Lights', 'The Long Return', 'After Midnight']],
    ['pulse.radio', ['Morning Mix', 'New Frequencies', 'Listener Selects', 'Night Drive']],
    ['little.comet', ['Tiny Explorers', 'Build It!', 'Comet Club', 'Storytime']],
    ['world.window', ['Northern Lines', 'Island Kitchens', 'City Walks', 'Night Trains']],
  ] as const;
  let count = 0;
  for (const [channelId, titles] of schedules) {
    const scopedId = `${SOURCE_ID}::${channelId}`;
    byChannel.set(scopedId, titles.map((title, index) => {
      count += 1;
      return programme(`${channelId}-${index}`, title, (index - 1) * 60);
    }));
    idByName.set(`${SOURCE_ID}::${LIVE.find((item) => item.tvgId === channelId)!.title.toLowerCase()}`, scopedId);
    nameById.set(scopedId, LIVE.find((item) => item.tvgId === channelId)!.title);
  }
  return { byChannel, idByName, nameById, channelCount: schedules.length, programmeCount: count };
}

const DOWNLOADS: DownloadJob[] = [
  { id: 'download-atlas', sourceUrl: 'https://media.example.test/vod/movie-atlas.mp4', fileName: 'Atlas Station.mp4', state: 'downloading', progress: 0.68, downloadedBytes: 2_720_000_000, totalBytes: 4_000_000_000, attempts: 1, maxAttempts: 3, createdAt: now - 900_000, updatedAt: now },
  { id: 'download-sea', sourceUrl: 'https://media.example.test/vod/movie-quiet-sea.mp4', fileName: 'Across the Quiet Sea.mp4', state: 'paused', progress: 0.34, downloadedBytes: 1_020_000_000, totalBytes: 3_000_000_000, attempts: 1, maxAttempts: 3, createdAt: now - 1_800_000, updatedAt: now - 120_000 },
  { id: 'download-orchard', sourceUrl: 'https://media.example.test/vod/movie-glass-orchard.mp4', fileName: 'The Glass Orchard.mp4', state: 'queued', progress: 0, downloadedBytes: 0, totalBytes: 3_400_000_000, attempts: 0, maxAttempts: 3, createdAt: now - 600_000, updatedAt: now - 300_000 },
  { id: 'download-signal', sourceUrl: 'https://media.example.test/vod/movie-signal-hill.mp4', filePath: 'C:\\Movena\\Signal Hill.mp4', fileName: 'Signal Hill.mp4', state: 'completed', progress: 1, downloadedBytes: 2_800_000_000, totalBytes: 2_800_000_000, attempts: 1, maxAttempts: 3, createdAt: now - 7_200_000, updatedAt: now - 3_600_000 },
];

function seedFixture(queryClient: QueryClient, surface: ReadmeSurface) {
  installPlayerFixtureStubs();
  useSettingsStore.setState({
    language: 'en',
    sidebarCollapsed: false,
    showCollapsedSidebarBadges: true,
    onboardingDismissed: true,
    motionPreference: 'reduced',
    accentColor: '#78aef8',
    upcomingEnabled: false,
    upcomingHomeEnabled: false,
    epgSource: 'provider',
    epgXmltvUrl: '',
  });
  useSourceStore.setState({
    profiles: [PROFILE],
    enabledSourceIds: [SOURCE_ID],
    isInitializing: false,
    initializationError: null,
    runtimes: {
      [SOURCE_ID]: {
        connection: { location: 'https://playlist.example.test/demo.m3u', epgUrl: GUIDE_URL, headers: {} },
        playlist: PLAYLIST,
        baseUrl: 'https://media.example.test/',
        status: 'ready',
        error: null,
        revision: 1,
      },
    },
  });
  useLibraryStore.setState({
    favorites: [
      { id: 'movie-atlas', sourceId: SOURCE_ID, sourceItemId: 'movie-atlas', title: 'Atlas Station', type: 'vod', posterUrl: artwork(0), year: '2026', rating: 8.6 },
      { id: 'movie-paper-moons', sourceId: SOURCE_ID, sourceItemId: 'movie-paper-moons', title: 'Paper Moons', type: 'vod', posterUrl: artwork(4), year: '2025', rating: 8.3 },
    ],
    collections: [{ id: 'weekend', name: 'Weekend picks', items: [] }],
    history: [
      { id: 'movie-quiet-sea', sourceId: SOURCE_ID, sourceItemId: 'movie-quiet-sea', title: 'Across the Quiet Sea', type: 'vod', posterUrl: artwork(1), year: '2025', rating: 8.1, progressPercentage: 46, currentTime: 3_120, duration: 6_780, lastWatchedAt: now - 900_000 },
      { id: 'series-northstar-s1e1', sourceId: SOURCE_ID, sourceItemId: 'series-northstar-s1e1', title: 'Northstar Files', type: 'series', posterUrl: artwork(5), progressPercentage: 23, currentTime: 720, duration: 3_120, lastWatchedAt: now - 7_200_000, seasonNum: 1, episodeNum: 1, episodeTitle: 'The Arrival' },
    ],
    watched: [],
  });
  useDownloadStore.setState({ jobs: DOWNLOADS });
  usePlayerStore.setState({ activeStream: null, showControls: true, isFullscreen: false });

  const sourceScope = getCombinedSourceQueryScope([getM3uQueryScope(SOURCE_ID, 1)]);
  const descriptorScope = `${SOURCE_ID}:${getUrlQueryScope(GUIDE_URL)}`;
  queryClient.setQueryData(['xmltv_guides', sourceScope, descriptorScope], guide());

  if (surface === 'player-vod') {
    usePlayerStore.getState().playStream({
      id: 'movie-atlas',
      sourceId: SOURCE_ID,
      sourceItemId: 'movie-atlas',
      title: 'Atlas Station',
      type: 'vod',
      streamUrl: 'https://media.example.test/vod/movie-atlas.mp4',
      posterUrl: artwork(0),
      knownDuration: 6_900,
      startPosition: 2_145,
      tags: ['4K', 'HDR', 'DOLBY ATMOS'],
    });
    usePlayerStore.setState({
      isPlaying: true,
      currentTime: 2_145,
      duration: 6_900,
      volume: 74,
      isMuted: false,
      playbackSpeed: 1,
      isBuffering: false,
      isVideoReady: true,
      showControls: true,
      audioTracks: [
        { id: 1, type: 'audio', title: 'English', lang: 'en', selected: true, codec: 'eac3' },
        { id: 2, type: 'audio', title: 'Deutsch', lang: 'de', codec: 'aac' },
      ],
      subtitleTracks: [
        { id: 3, type: 'sub', title: 'English', lang: 'en', selected: true },
        { id: 4, type: 'sub', title: 'Deutsch', lang: 'de' },
      ],
      currentAudioTrack: 1,
      currentSubTrack: 3,
      subtitlesVisible: true,
      chapters: [{ title: 'Opening', time: 0 }, { title: 'The Signal', time: 1_260 }, { title: 'Final Approach', time: 5_520 }],
    });
  } else if (surface === 'player-live') {
    const channel = LIVE[0]!;
    usePlayerStore.getState().playStream({
      id: channel.id,
      sourceId: SOURCE_ID,
      sourceItemId: channel.id,
      title: 'Horizon News',
      type: 'live',
      streamUrl: channel.url,
      posterUrl: channel.logo,
      epgChannelId: channel.tvgId,
      categoryId: channel.categoryId,
      tags: ['FULL HD', '50 FPS'],
    });
    usePlayerStore.setState({
      isPlaying: true,
      currentTime: 0,
      duration: 0,
      volume: 62,
      isMuted: false,
      isBuffering: false,
      isVideoReady: true,
      showControls: true,
      isRecording: false,
      audioTracks: [{ id: 1, type: 'audio', title: 'Original', lang: 'en', selected: true, codec: 'aac' }],
      currentAudioTrack: 1,
    });
  }
}

function PlayerFixture() {
  const stream = usePlayerStore((state) => state.activeStream);
  const background = stream?.type === 'live' ? artwork(3, true) : artwork(0, true);
  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: '#070a10',
          backgroundImage: `linear-gradient(rgba(5, 8, 13, .08), rgba(5, 8, 13, .2)), url("${background}")`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
      <PlayerShell />
    </>
  );
}

function Surface({ surface }: { surface: ReadmeSurface }) {
  if (surface === 'hero') return <Home />;
  if (surface === 'live-tv') return <LiveTV />;
  if (surface === 'live-epg') return <Epg />;
  if (surface === 'search') return <Search />;
  if (surface === 'downloads') return <PageTransition><Downloads /></PageTransition>;
  if (surface === 'settings' || surface === 'playback-settings') return <Settings />;
  if (surface === 'm3u-editor') return <M3uEditor initialSourceId={SOURCE_ID} onClose={() => undefined} />;
  if (surface === 'series-details') {
    const seriesId = getM3uSeriesId(SOURCE_ID, 'Northstar Files');
    return (
      <>
        <Series />
        <M3uSeriesDetailModal
          seriesId={seriesId}
          sourceId={SOURCE_ID}
          sourceItemId={seriesId}
          seriesTitle="Northstar Files"
          seriesPoster={artwork(5)}
          initialSeasonNumber={1}
          initialEpisodeNumber={2}
          onClose={() => undefined}
        />
      </>
    );
  }
  return (
    <>
      <Movies />
      <M3uMovieDetailModal
        movieId="movie-atlas"
        sourceId={SOURCE_ID}
        sourceItemId="movie-atlas"
        movieTitle="Atlas Station"
        moviePoster={artwork(0)}
        onClose={() => undefined}
      />
    </>
  );
}

const ROUTES: Record<ReadmeSurface, string> = {
  hero: '/',
  'live-tv': '/live',
  'live-epg': '/epg',
  'player-vod': '/movies',
  'player-live': '/live',
  'library-details': '/movies',
  'series-details': '/series',
  search: '/search?q=atlas',
  'm3u-editor': `/m3u-editor/${SOURCE_ID}`,
  downloads: '/downloads',
  settings: '/settings?section=sources',
  'playback-settings': '/settings?section=playback',
};

export function ReadmeHarness({ surface }: { surface: ReadmeSurface }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY, refetchOnWindowFocus: false } },
  });
  seedFixture(queryClient, surface);
  const isPlayerSurface = surface === 'player-vod' || surface === 'player-live';

  return (
    <MemoryRouter initialEntries={[ROUTES[surface]]}>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="always">
          <div className={appStyles.appContainer}>
            <div className={appStyles.windowDragArea} data-tauri-drag-region aria-hidden="true" />
            {isPlayerSurface ? <PlayerFixture /> : (
              <div className={appStyles.appUi}>
                <Sidebar />
                <main className={appStyles.mainContent}>
                  <div className={appStyles.pageContainer}>
                    <Surface surface={surface} />
                  </div>
                </main>
              </div>
            )}
            <WindowChrome />
          </div>
        </MotionConfig>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
