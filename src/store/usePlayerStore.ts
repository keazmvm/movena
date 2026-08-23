import { create } from 'zustand';
import {
  createIdlePlaybackState,
  reducePlaybackState,
  type PlaybackState,
} from '../utils/playbackState';
import { useStreamVerificationStore } from './useStreamVerificationStore';

// ─── Types ───────────────────────────────────────────────────

export type StreamType = 'live' | 'vod' | 'series';

export interface PlayableStream {
  id: string | number;
  title: string;
  type: StreamType;
  streamUrl: string;
  httpHeaders?: Record<string, string>;
  sourceId?: string;
  sourceItemId?: string;
  epgChannelId?: string;
  /** The provider category this stream was opened from — scopes the Live TV channel switcher to it. */
  categoryId?: string;
  posterUrl?: string;
  /**
   * The show's own artwork, kept alongside the episode still in `posterUrl`.
   * Continue Watching lists one card per series, so it wants the series cover
   * rather than whatever frame the current episode happens to use.
   */
  seriesPosterUrl?: string;
  seriesId?: string | number;
  /** Provider-local series id used for source-specific detail requests. */
  seriesSourceItemId?: string | number;
  /** Clean series identity kept separate from the provider's episode name. */
  seriesTitle?: string;
  seasonNum?: string | number;
  episodeNum?: string | number;
  /** Clean episode-only label, for example `Stick or Twist`. */
  episodeTitle?: string;
  startPosition?: number;
  /** Last-known total duration (from watch history) so the seekbar can
   *  render at the correct position before mpv reports the real value. */
  knownDuration?: number;
  tags?: string[];
  country?: string | null;
  radio?: boolean;
  radioMetadata?: {
    title: string;
    artist?: string;
    album?: string;
    genre?: string;
    channelNumber?: string;
    logoUrl?: string;
  };
  /** Ordered stream-level fallbacks used when the primary URL cannot start. */
  fallbacks?: Array<Pick<PlayableStream, 'streamUrl' | 'httpHeaders'>>;
}

export interface MpvTrack {
  id: number;
  type: 'video' | 'audio' | 'sub';
  title?: string;
  lang?: string;
  selected?: boolean;
  codec?: string;
  codecDescription?: string;
  codecProfile?: string;
  decoderDescription?: string;
  default?: boolean;
}

/** A chapter mark, when the source embeds any — most IPTV streams have none. */
export interface MpvChapter {
  title?: string;
  time: number;
}

export interface PlayerVideoParams {
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  pixelFormat?: string;
  hardwarePixelFormat?: string;
  colorPrimaries?: string;
  colorTransfer?: string;
  colorMatrix?: string;
  maxCll?: number;
  maxFall?: number;
}

export interface PlayerAudioParams {
  format?: string;
  sampleRate?: number;
  channels?: string;
  channelCount?: number;
}

export interface PlayerDiagnosticSample {
  timestamp: number;
  cacheDurationSeconds?: number;
  cacheBufferingPercent?: number;
  cacheSpeedBytesPerSecond?: number;
  videoBitrateBitsPerSecond?: number;
  audioBitrateBitsPerSecond?: number;
  estimatedFps?: number;
  avSyncSeconds?: number;
  totalAvSyncChangeSeconds?: number;
  frameDropCount?: number;
  decoderFrameDropCount?: number;
}

export interface PlayerDiagnostics {
  sessionStartedAt: number | null;
  mpvStartMs: number | null;
  videoReadyMs: number | null;
  firstPositionMs: number | null;
  lastSeekMs: number | null;
  seekStartedAt: number | null;
  rebufferCount: number;
  totalRebufferMs: number;
  rebufferStartedAt: number | null;
  hardwareDecoder: string | null;
  videoParams: PlayerVideoParams | null;
  audioParams: PlayerAudioParams | null;
  latest: PlayerDiagnosticSample | null;
  samples: PlayerDiagnosticSample[];
}

const MAX_DIAGNOSTIC_SAMPLES = 60;

function emptyDiagnostics(sessionStartedAt: number | null = null): PlayerDiagnostics {
  return {
    sessionStartedAt,
    mpvStartMs: null,
    videoReadyMs: null,
    firstPositionMs: null,
    lastSeekMs: null,
    seekStartedAt: null,
    rebufferCount: 0,
    totalRebufferMs: 0,
    rebufferStartedAt: null,
    hardwareDecoder: null,
    videoParams: null,
    audioParams: null,
    latest: null,
    samples: [],
  };
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseDiagnosticSample(data: unknown): {
  sample: PlayerDiagnosticSample;
  hardwareDecoder?: string;
  videoParams?: PlayerVideoParams;
  audioParams?: PlayerAudioParams;
} | null {
  const value = recordValue(data);
  if (!value) return null;

  const video = recordValue(value['video-params']);
  const audio = recordValue(value['audio-params']);
  const videoParams = video ? {
    width: finiteNumber(video.w),
    height: finiteNumber(video.h),
    displayWidth: finiteNumber(video.dw),
    displayHeight: finiteNumber(video.dh),
    pixelFormat: stringValue(video.pixelformat),
    hardwarePixelFormat: stringValue(video['hw-pixelformat']),
    colorPrimaries: stringValue(video.primaries),
    colorTransfer: stringValue(video.gamma),
    colorMatrix: stringValue(video.colormatrix),
    maxCll: finiteNumber(video['max-cll']),
    maxFall: finiteNumber(video['max-fall']),
  } satisfies PlayerVideoParams : undefined;
  const audioParams = audio ? {
    format: stringValue(audio.format),
    sampleRate: finiteNumber(audio.samplerate),
    channels: stringValue(audio.channels),
    channelCount: finiteNumber(audio['channel-count']),
  } satisfies PlayerAudioParams : undefined;

  return {
    hardwareDecoder: stringValue(value['hwdec-current']),
    videoParams,
    audioParams,
    sample: {
      timestamp: Date.now(),
      cacheDurationSeconds: finiteNumber(value['demuxer-cache-duration']),
      cacheBufferingPercent: finiteNumber(value['cache-buffering-state']),
      cacheSpeedBytesPerSecond: finiteNumber(value['cache-speed']),
      videoBitrateBitsPerSecond: finiteNumber(value['video-bitrate']),
      audioBitrateBitsPerSecond: finiteNumber(value['audio-bitrate']),
      estimatedFps: finiteNumber(value['estimated-vf-fps']),
      avSyncSeconds: finiteNumber(value.avsync),
      totalAvSyncChangeSeconds: finiteNumber(value['total-avsync-change']),
      frameDropCount: finiteNumber(value['frame-drop-count']),
      decoderFrameDropCount: finiteNumber(value['decoder-frame-drop-count']),
    },
  };
}

// ─── Store Interface ─────────────────────────────────────────

interface PlayerState {
  // Stream identity
  activeStream: PlayableStream | null;
  sessionId: string | null;
  playback: PlaybackState;

  // MPV-synced playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;         // 0–100 (MPV native scale)
  isMuted: boolean;
  playbackSpeed: number;
  isBuffering: boolean;
  isVideoReady: boolean;
  eofReached: boolean;
  isRecording: boolean;

  // Track info from MPV
  videoTracks: MpvTrack[];
  audioTracks: MpvTrack[];
  subtitleTracks: MpvTrack[];
  currentAudioTrack: number;
  currentSubTrack: number;
  subtitlesVisible: boolean;
  /** Chapter marks reported by the current file, if it has any. */
  chapters: MpvChapter[];

  // Bounded, sanitized native player telemetry for the Developer HUD.
  diagnostics: PlayerDiagnostics;

  // UI state
  showControls: boolean;
  isFullscreen: boolean;
  activePopover: 'audio' | 'subtitles' | 'speed' | 'aspect' | 'image' | null;
  showEpisodesDrawer: boolean;
  showChannelsDrawer: boolean;

  // Feedback HUD
  feedback: {
    type: 'play' | 'pause' | 'volume';
    value?: number;
    key: number;
  } | null;

  // Actions — Stream lifecycle
  playStream: (stream: PlayableStream) => void;
  closePlayer: () => void;

  // Actions — MPV event sync
  updateFromMpvEvent: (name: string, data: unknown, sessionId?: string) => void;
  setTrackList: (tracks: unknown[], sessionId?: string) => void;
  startPlaybackSession: () => void;
  markMpvStartCompleted: () => void;

  // Actions — UI state
  setShowControls: (show: boolean) => void;
  setIsFullscreen: (fs: boolean) => void;
  setActivePopover: (popover: 'audio' | 'subtitles' | 'speed' | 'aspect' | 'image' | null) => void;
  setShowEpisodesDrawer: (show: boolean) => void;
  setShowChannelsDrawer: (show: boolean) => void;
  triggerFeedback: (type: 'play' | 'pause' | 'volume', value?: number) => void;
  clearFeedback: () => void;

}

// ─── Store ───────────────────────────────────────────────────

let sessionSequence = 0;
function nextSessionId(): string {
  sessionSequence += 1;
  return `${Date.now().toString(36)}-${sessionSequence.toString(36)}`;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Initial state
  activeStream: null,
  sessionId: null,
  playback: createIdlePlaybackState(),
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 100,
  isMuted: false,
  playbackSpeed: 1,
  isBuffering: false,
  isVideoReady: false,
  eofReached: false,
  isRecording: false,

  videoTracks: [],
  audioTracks: [],
  subtitleTracks: [],
  currentAudioTrack: 0,
  currentSubTrack: 0,
  subtitlesVisible: false,
  chapters: [],
  diagnostics: emptyDiagnostics(),

  showControls: true,
  isFullscreen: false,
  activePopover: null,
  showEpisodesDrawer: false,
  // Deliberately not reset by playStream — switching channels while zapping
  // through this drawer should keep it open. closePlayer still clears it.
  showChannelsDrawer: false,
  feedback: null,

  // ── Stream lifecycle ────────────────────────────────────────

  playStream: (stream) =>
    set((state) => ({
      activeStream: stream,
      sessionId: nextSessionId(),
      playback: reducePlaybackState(state.playback, {
        type: 'session-started',
        generation: (state.playback.generation ?? 0) + 1,
      }).state,
      isPlaying: false,
      currentTime: stream.startPosition || 0,
      duration: stream.knownDuration || 0,
      volume: 100,
      isMuted: false,
      playbackSpeed: 1,
      isBuffering: true,
      isVideoReady: false,
      eofReached: false,
      isRecording: false,
      videoTracks: [],
      audioTracks: [],
      subtitleTracks: [],
      currentAudioTrack: 0,
      currentSubTrack: 0,
      subtitlesVisible: false,
      chapters: [],
      diagnostics: emptyDiagnostics(Date.now()),
      showControls: true,
      isFullscreen: false,
      activePopover: null,
      showEpisodesDrawer: false,
      feedback: null,
    })),

  startPlaybackSession: () =>
    set((state) => ({
      sessionId: nextSessionId(),
      playback: reducePlaybackState(state.playback, {
        type: 'session-started',
        generation: (state.playback.generation ?? 0) + 1,
      }).state,
      isPlaying: false,
      isBuffering: true,
      isVideoReady: false,
      eofReached: false,
      isRecording: false,
      videoTracks: [],
      audioTracks: [],
      subtitleTracks: [],
      chapters: [],
      diagnostics: emptyDiagnostics(Date.now()),
    })),

  closePlayer: () =>
    set({
      activeStream: null,
      sessionId: null,
      playback: createIdlePlaybackState(),
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      isBuffering: false,
      isVideoReady: false,
      eofReached: false,
      isRecording: false,
      videoTracks: [],
      audioTracks: [],
      subtitleTracks: [],
      currentAudioTrack: 0,
      currentSubTrack: 0,
      subtitlesVisible: false,
      chapters: [],
      diagnostics: emptyDiagnostics(),
      showControls: true,
      activePopover: null,
      showEpisodesDrawer: false,
      showChannelsDrawer: false,
      feedback: null,
    }),

  // ── MPV event sync ──────────────────────────────────────────

  updateFromMpvEvent: (name, data, eventSessionId) => {
    if (eventSessionId && eventSessionId !== get().sessionId) return;
    const playbackName = ['vo-configured', 'pause', 'paused-for-cache', 'seeking', 'time-pos', 'eof-reached']
      .includes(name) ? name as 'vo-configured' | 'pause' | 'paused-for-cache' | 'seeking' | 'time-pos' | 'eof-reached' : null;
    if (playbackName) {
      set((state) => {
        if (state.playback.generation === null) return {};
        const transition = reducePlaybackState(state.playback, {
          type: 'mpv-property',
          generation: state.playback.generation,
          name: playbackName,
          value: data,
        });
        if (!transition.accepted) return {};
        return {
          playback: transition.state,
          isVideoReady: transition.state.videoReady,
          isBuffering: transition.state.status === 'buffering' || transition.state.status === 'loading',
          isPlaying: !transition.state.paused && transition.state.status === 'playing',
          eofReached: transition.state.status === 'ended',
        };
      });
    }
    switch (name) {
      case 'time-pos':
        if (typeof data === 'number') {
          set((state) => ({
            currentTime: data,
            isBuffering: false,
            diagnostics: state.diagnostics.firstPositionMs === null && state.diagnostics.sessionStartedAt !== null
              ? {
                  ...state.diagnostics,
                  firstPositionMs: Date.now() - state.diagnostics.sessionStartedAt,
                }
              : state.diagnostics,
          }));
        }
        break;
      case 'duration':
        if (typeof data === 'number' && data > 0) {
          set({ duration: data });
        }
        break;
      case 'pause':
        set({ isPlaying: !data });
        break;
      case 'volume':
        if (typeof data === 'number') {
          set({ volume: data, isMuted: data === 0 });
        }
        break;
      case 'speed':
        if (typeof data === 'number' && data > 0) {
          set({ playbackSpeed: data });
        }
        break;
      case 'eof-reached':
        if (data === true) {
          set({ eofReached: true, isPlaying: false });
        }
        break;
      case 'recording':
        set({ isRecording: data === true });
        break;
      case 'vo-configured':
        set((state) => ({
          isVideoReady: data === true,
          diagnostics: data === true && state.diagnostics.videoReadyMs === null && state.diagnostics.sessionStartedAt !== null
            ? {
                ...state.diagnostics,
                videoReadyMs: Date.now() - state.diagnostics.sessionStartedAt,
              }
            : state.diagnostics,
        }));
        break;
      case 'paused-for-cache':
        set((state) => {
          const isCachePaused = data === true;
          const now = Date.now();
          if (isCachePaused && state.isVideoReady && state.diagnostics.rebufferStartedAt === null) {
            return {
              isBuffering: true,
              diagnostics: {
                ...state.diagnostics,
                rebufferCount: state.diagnostics.rebufferCount + 1,
                rebufferStartedAt: now,
              },
            };
          }
          if (!isCachePaused && state.diagnostics.rebufferStartedAt !== null) {
            return {
              isBuffering: false,
              diagnostics: {
                ...state.diagnostics,
                totalRebufferMs: state.diagnostics.totalRebufferMs + now - state.diagnostics.rebufferStartedAt,
                rebufferStartedAt: null,
              },
            };
          }
          return { isBuffering: isCachePaused };
        });
        break;
      case 'seeking':
        set((state) => {
          const now = Date.now();
          if (data === true && state.diagnostics.seekStartedAt === null) {
            return { diagnostics: { ...state.diagnostics, seekStartedAt: now } };
          }
          if (data === false && state.diagnostics.seekStartedAt !== null) {
            return {
              diagnostics: {
                ...state.diagnostics,
                lastSeekMs: now - state.diagnostics.seekStartedAt,
                seekStartedAt: null,
              },
            };
          }
          return {};
        });
        break;
      case 'diagnostic-sample': {
        const parsed = parseDiagnosticSample(data);
        if (parsed) {
          set((state) => ({
            diagnostics: {
              ...state.diagnostics,
              hardwareDecoder: parsed.hardwareDecoder ?? state.diagnostics.hardwareDecoder,
              videoParams: parsed.videoParams ?? state.diagnostics.videoParams,
              audioParams: parsed.audioParams ?? state.diagnostics.audioParams,
              latest: parsed.sample,
              samples: [...state.diagnostics.samples, parsed.sample].slice(-MAX_DIAGNOSTIC_SAMPLES),
            },
          }));
          if (parsed.videoParams?.width && parsed.videoParams?.height) {
            const active = get().activeStream;
            if (active) {
              const isHdr = parsed.videoParams.colorTransfer === 'pq' ||
                parsed.videoParams.colorTransfer === 'hlg' ||
                parsed.videoParams.colorPrimaries === 'bt.2020';
              useStreamVerificationStore.getState().recordVerification(String(active.id), {
                width: parsed.videoParams.width,
                height: parsed.videoParams.height,
                fps: parsed.sample.estimatedFps,
                isHdr,
                audioCodec: parsed.audioParams?.format,
                audioChannels: parsed.audioParams?.channelCount,
              });
            }
          }
        }
        break;
      }
      case 'sub-visibility':
        set({ subtitlesVisible: data === true });
        break;
      case 'chapter-list':
        if (Array.isArray(data)) {
          const chapters = data
            .filter((chapter): chapter is { title?: unknown; time: number } =>
              !!chapter && typeof chapter === 'object' && 'time' in chapter &&
              typeof (chapter as { time?: unknown }).time === 'number'
            )
            .map((chapter) => ({
              title: typeof chapter.title === 'string' ? chapter.title : undefined,
              time: chapter.time,
            }));
          set({ chapters });
        }
        break;
    }
  },

  setTrackList: (tracks, eventSessionId) => {
    if (eventSessionId && eventSessionId !== get().sessionId) return;
    const validTracks = tracks.flatMap((track): MpvTrack[] => {
      if (!track || typeof track !== 'object') return [];
      const candidate = track as Record<string, unknown>;
      if (typeof candidate.id !== 'number' ||
        (candidate.type !== 'video' && candidate.type !== 'audio' && candidate.type !== 'sub')) {
        return [];
      }
      return [{
        id: candidate.id,
        type: candidate.type,
        title: stringValue(candidate.title),
        lang: stringValue(candidate.lang),
        selected: candidate.selected === true,
        codec: stringValue(candidate.codec),
        codecDescription: stringValue(candidate['codec-desc']),
        codecProfile: stringValue(candidate['codec-profile']),
        decoderDescription: stringValue(candidate['decoder-desc']),
        default: candidate.default === true,
      }];
    });
    const videoTracks = validTracks.filter((track) => track.type === 'video');
    const audioTracks = validTracks.filter((track) => track.type === 'audio');
    const subtitleTracks = validTracks.filter((track) => track.type === 'sub');

    const activeAudio = audioTracks.find((t) => t.selected);
    const activeSub = subtitleTracks.find((t) => t.selected);

    set({
      videoTracks,
      audioTracks,
      subtitleTracks,
      currentAudioTrack: activeAudio?.id ?? get().currentAudioTrack,
      currentSubTrack: activeSub?.id ?? get().currentSubTrack,
    });
  },

  markMpvStartCompleted: () => set((state) => ({
    diagnostics: state.diagnostics.mpvStartMs === null && state.diagnostics.sessionStartedAt !== null
      ? {
          ...state.diagnostics,
          mpvStartMs: Date.now() - state.diagnostics.sessionStartedAt,
        }
      : state.diagnostics,
  })),

  // ── UI state ────────────────────────────────────────────────

  setShowControls: (show) => set({ showControls: show }),
  setIsFullscreen: (fs) => set({ isFullscreen: fs }),
  setActivePopover: (popover) => set({ activePopover: popover }),
  setShowEpisodesDrawer: (show) => set({ showEpisodesDrawer: show }),
  setShowChannelsDrawer: (show) => set({ showChannelsDrawer: show }),

  triggerFeedback: (type, value) => {
    const prev = get().feedback;
    const key = type === 'volume' && prev?.type === 'volume' ? prev.key : Date.now();
    set({ feedback: { type, value, key } });
  },

  clearFeedback: () => set({ feedback: null }),

}));
