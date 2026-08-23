import { invoke } from '@tauri-apps/api/core';

export interface MpvStartOptions {
  /** Frontend-owned identity echoed by every native event for this session. */
  sessionId?: string;
  url: string;
  hwdec: string;
  hdr: boolean;
  toneMapping?: string;
  cacheSecs: number;
  demuxerMaxBytes: string;
  initialVolume: number;
  initialSpeed: number;
  subtitlesVisible: boolean;
  initialAudioDelayMs?: number;
  subtitleFontSize?: number;
  subtitleFontFamily?: string;
  subtitleOpacity?: number;
  subtitleBorderSize?: number;
  subtitleShadowOffset?: number;
  startPosition?: number;
  httpHeaders?: Record<string, string>;
}

export interface M3uFetchOptions {
  url: string;
  headers?: Record<string, string>;
  /** Opaque source id used by native conditional-request caching. */
  cacheKey?: string;
  allowInsecureHttp?: boolean;
}

export interface M3uDocument {
  content: string;
  baseUrl: string;
  fileName?: string;
}

export type M3uProbeStatus = 'online' | 'offline' | 'unauthorized' | 'timeout';

export interface M3uProbeOptions {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface M3uProbeResult {
  status: M3uProbeStatus;
  httpStatus?: number;
  errorMessage?: string;
  latencyMs: number;
}

export interface TextDocument {
  content: string;
  cacheKey?: string;
}

export interface DownloadMediaOptions {
  id?: string;
  url: string;
  fileName: string;
  headers?: Record<string, string>;
  directory?: string;
}


/**
 * Strongly-typed wrapper for all Tauri IPC commands in Movena.
 */
export const tauriApi = {
  /** Spawn or re-initialize native mpv player instance */
  mpvStart: (options: MpvStartOptions) => invoke<void>('mpv_start', { options }),

  /** Terminate active mpv player instance */
  mpvStop: () => invoke<void>('mpv_stop'),

  /** Toggle playback pause state */
  mpvPlayPause: () => invoke<void>('mpv_play_pause'),

  /** Seek to absolute time position in seconds */
  mpvSeek: (position: number) => invoke<void>('mpv_seek', { position }),

  /** Relative seek forward or backward in seconds */
  mpvSeekRelative: (seconds: number) => invoke<void>('mpv_seek_relative', { seconds }),

  /** Set playback audio volume level (0-100) */
  mpvSetVolume: (volume: number) => invoke<void>('mpv_set_volume', { volume }),

  /** Set playback speed multiplier (e.g. 0.5 to 2.0) */
  mpvSetSpeed: (speed: number) => invoke<void>('mpv_set_speed', { speed }),

  /** Switch active audio track ID */
  mpvSetAudioTrack: (trackId: number) => invoke<void>('mpv_set_audio_track', { trackId }),

  /** Switch active subtitle track ID (or 0 for disabled) */
  mpvSetSubTrack: (trackId: number) => invoke<void>('mpv_set_sub_track', { trackId }),

  /** Start or stop stream recording dump to file path */
  mpvSetRecording: (path: string) => invoke<void>('mpv_set_recording', { path }),

  /** Execute low-level mpv command array */
  mpvCommand: (args: string[]) => invoke<void>('mpv_command', { args }),

  /** Toggle native/borderless window fullscreen */
  playerSetFullscreen: (on: boolean) => invoke<boolean>('player_set_fullscreen', { on }),

  /** Hide or show native cursor over video viewport */
  playerSetCursorHidden: (hidden: boolean) => invoke<boolean>('player_set_cursor_hidden', { hidden }),

  /** Store the active provider password in the operating-system credential vault. */
  credentialStore: (password: string) => invoke<void>('credential_store', { password }),

  /** Restore the active provider password from the operating-system credential vault. */
  credentialLoad: () => invoke<string | null>('credential_load'),

  /** Remove the active provider password from the operating-system credential vault. */
  credentialDelete: () => invoke<void>('credential_delete'),

  /** Store one playlist connection secret by its non-secret source id. */
  sourceSecretStore: (sourceId: string, value: string) =>
    invoke<void>('source_secret_store', { sourceId, value }),

  /** Restore one playlist connection secret. */
  sourceSecretLoad: (sourceId: string) =>
    invoke<string | null>('source_secret_load', { sourceId }),

  /** Remove one playlist connection secret. */
  sourceSecretDelete: (sourceId: string) =>
    invoke<void>('source_secret_delete', { sourceId }),

  /** Download a remote M3U outside the webview's CORS boundary. */
  m3uFetch: (options: M3uFetchOptions) => invoke<M3uDocument>('m3u_fetch', { options }),

  /** Probe a stream outside the webview CORS boundary with its source headers. */
  m3uProbeStream: (options: M3uProbeOptions) => invoke<M3uProbeResult>('m3u_probe_stream', { options }),

  /** Download and decompress an XMLTV guide outside the webview's CORS boundary. */
  xmltvFetch: (options: M3uFetchOptions) => invoke<TextDocument>('xmltv_fetch', { options }),

  /** Inspect a small XMLTV response prefix outside the webview's CORS boundary. */
  xmltvProbe: (options: M3uFetchOptions) => invoke<boolean>('xmltv_probe', { options }),

  /** Start a managed media download; progress and lifecycle arrive on download-event. */
  downloadMediaStart: (options: DownloadMediaOptions & { id: string }) => invoke<void>('download_media_start', { options }),
  downloadMediaPause: (id: string) => invoke<void>('download_media_pause', { id }),
  downloadMediaResume: (id: string) => invoke<void>('download_media_resume', { id }),
  downloadMediaCancel: (id: string) => invoke<void>('download_media_cancel', { id }),

  /** Promote a downloaded XMLTV body only after the webview parsed it successfully. */
  xmltvCacheCommit: (cacheKey: string) => invoke<void>('xmltv_cache_commit', { cacheKey }),

  /** Read a user-selected local M3U and report its base directory URL. */
  m3uReadFile: (path: string) => invoke<M3uDocument>('m3u_read_file', { path }),

  /** Write a validated M3U playlist file to a user-selected path. */
  m3uWriteFile: (path: string, content: string) =>
    invoke<void>('m3u_write_file', { path, content }),

  /** Persist the latest valid playlist body in application data. */
  m3uCacheStore: (sourceId: string, document: M3uDocument) =>
    invoke<void>('m3u_cache_store', { sourceId, document }),

  /** Load a previously validated playlist body. */
  m3uCacheLoad: (sourceId: string) =>
    invoke<M3uDocument | null>('m3u_cache_load', { sourceId }),

  /** Remove a playlist's application-data cache. */
  m3uCacheDelete: (sourceId: string) => invoke<void>('m3u_cache_delete', { sourceId }),

  /** Remove all Movena-managed caches and the supplied source credentials. */
  appDataClear: (sourceIds: string[]) => invoke<void>('app_data_clear', { sourceIds }),

  /** Read a user-selected, size-limited Movena settings backup. */
  settingsConfigRead: (path: string) => invoke<string>('settings_config_read', { path }),

  /** Write a validated Movena settings backup to a user-selected path. */
  settingsConfigWrite: (path: string, content: string) =>
    invoke<void>('settings_config_write', { path, content }),
};
