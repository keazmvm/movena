import { create } from 'zustand';
import type { M3uDocument } from '../api/ipc';
import { generateM3u, type M3uPlaylist } from '../api/m3u';
import {
  deleteM3uCache,
  deleteM3uConnection,
  fetchRemoteM3u,
  loadM3uCache,
  loadM3uConnection,
  readLocalM3u,
  storeM3uCache,
  storeM3uConnection,
  writeLocalM3u,
  type M3uConnectionSecret,
} from '../services/m3uRepository';
import { invalidateSourceQueries } from '../api/queryClient';
import { deleteM3uDraft } from '../services/m3uDraftRepository';
import { clearM3uVersions } from '../services/m3uVersionHistory';
import { parseM3uAsync } from '../services/m3uParser';
import { getErrorMessage } from '../utils/error';

/** Legacy singleton id, accepted only while upgrading older installations. */
export const XTREAM_SOURCE_ID = 'xtream';
export const SOURCE_PROFILES_STORAGE_KEY = 'movena-source-profiles-v1';
export const ENABLED_SOURCE_IDS_STORAGE_KEY = 'movena-enabled-sources-v1';
/** Read once when migrating the former single-source selection. */
export const ACTIVE_SOURCE_STORAGE_KEY = 'movena-active-source-v1';

export type M3uLocationType = 'remote' | 'local';
export type M3uEditorRefreshPolicy = 'preserve-edits' | 'replace-edits';

export interface M3uSourceProfile {
  id: string;
  kind: 'm3u';
  name: string;
  locationType: M3uLocationType;
  locationLabel: string;
  refreshIntervalMinutes: number;
  lastRefreshAt: number;
  entryCount: number;
  liveCount: number;
  vodCount: number;
  seriesCount: number;
  hasEpg: boolean;
  hasLocalEdits?: boolean;
  editorRefreshPolicy?: M3uEditorRefreshPolicy;
  editorWriteBack?: boolean;
}

export interface M3uSourceRuntime {
  connection: M3uConnectionSecret | null;
  playlist: M3uPlaylist | null;
  /** Resolution base retained from the cached/local document for relative entries. */
  baseUrl?: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  revision: number;
}

export interface AddRemoteM3uInput {
  name: string;
  url: string;
  epgUrl?: string;
  userAgent?: string;
  referrer?: string;
  refreshIntervalMinutes?: number;
}

export interface AddLocalM3uInput {
  name: string;
  fileName: string;
  content: string;
  baseUrl?: string;
  path?: string;
  epgUrl?: string;
}

export interface UpdateLocalM3uInput {
  name: string;
  epgUrl?: string;
  fileName?: string;
  content?: string;
  baseUrl?: string;
  path?: string;
}

interface SourceState {
  profiles: M3uSourceProfile[];
  runtimes: Record<string, M3uSourceRuntime>;
  enabledSourceIds: string[];
  isInitializing: boolean;
  initializationError: string | null;
  initialize: () => Promise<void>;
  setSourceEnabled: (sourceId: string, enabled: boolean) => void;
  replaceEnabledSourceId: (previousId: string, nextId: string) => void;
  addRemoteSource: (input: AddRemoteM3uInput) => Promise<M3uSourceProfile>;
  addLocalSource: (input: AddLocalM3uInput) => Promise<M3uSourceProfile>;
  addLocalPath: (name: string, path: string, epgUrl?: string) => Promise<M3uSourceProfile>;
  updateRemoteSource: (sourceId: string, input: AddRemoteM3uInput) => Promise<M3uSourceProfile>;
  updateLocalSource: (sourceId: string, input: UpdateLocalM3uInput) => Promise<M3uSourceProfile>;
  saveEditedSource: (sourceId: string, content: string, name?: string) => Promise<M3uSourceProfile>;
  refreshSource: (sourceId: string) => Promise<void>;
  refreshStaleSources: () => Promise<void>;
  setEditorRefreshPolicy: (sourceId: string, policy: M3uEditorRefreshPolicy) => void;
  setEditorWriteBack: (sourceId: string, enabled: boolean) => void;
  removeSource: (sourceId: string) => Promise<void>;
}

const emptyRuntime = (): M3uSourceRuntime => ({
  connection: null,
  playlist: null,
  status: 'idle',
  error: null,
  revision: 0,
});

function safeProfiles(): M3uSourceProfile[] {
  try {
    const raw = localStorage.getItem(SOURCE_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): M3uSourceProfile[] => {
      if (!value || typeof value !== 'object') return [];
      const profile = value as Partial<M3uSourceProfile>;
      if (
        profile.kind !== 'm3u'
        || typeof profile.id !== 'string'
        || !/^m3u-[a-z0-9-]{8,}$/i.test(profile.id)
        || typeof profile.name !== 'string'
        || (profile.locationType !== 'remote' && profile.locationType !== 'local')
      ) return [];
      const finite = (number: unknown, fallback = 0) => typeof number === 'number' && Number.isFinite(number)
        ? Math.max(0, number)
        : fallback;
      return [{
        id: profile.id,
        kind: 'm3u',
        name: profile.name.trim().slice(0, 120) || 'M3U Playlist',
        locationType: profile.locationType,
        locationLabel: typeof profile.locationLabel === 'string' ? profile.locationLabel.slice(0, 200) : 'Playlist',
        refreshIntervalMinutes: Math.max(15, finite(profile.refreshIntervalMinutes, 360)),
        lastRefreshAt: finite(profile.lastRefreshAt),
        entryCount: finite(profile.entryCount),
        liveCount: finite(profile.liveCount),
        vodCount: finite(profile.vodCount),
        seriesCount: finite(profile.seriesCount),
        hasEpg: profile.hasEpg === true,
        hasLocalEdits: profile.hasLocalEdits === true,
        editorRefreshPolicy: profile.editorRefreshPolicy === 'replace-edits' ? 'replace-edits' : 'preserve-edits',
        editorWriteBack: profile.editorWriteBack === true,
      }];
    });
  } catch {
    return [];
  }
}

function writeProfiles(profiles: M3uSourceProfile[]): void {
  localStorage.setItem(SOURCE_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function readEnabledSourceIds(profiles: M3uSourceProfile[]): string[] {
  const valid = (id: unknown): id is string => id === XTREAM_SOURCE_ID
    || (typeof id === 'string' && /^xtream-[a-z0-9-]{6,}$/i.test(id))
    || (typeof id === 'string' && profiles.some((profile) => profile.id === id));
  const stored = localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY);
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) return [...new Set(parsed.filter(valid))];
    } catch {
      // Fall through to the legacy single-source selection.
    }
  }
  const legacy = localStorage.getItem(ACTIVE_SOURCE_STORAGE_KEY);
  const enabledSourceIds = valid(legacy) ? [legacy] : [];
  localStorage.setItem(ENABLED_SOURCE_IDS_STORAGE_KEY, JSON.stringify(enabledSourceIds));
  localStorage.removeItem(ACTIVE_SOURCE_STORAGE_KEY);
  return enabledSourceIds;
}

function writeEnabledSourceIds(ids: string[]): void {
  localStorage.setItem(ENABLED_SOURCE_IDS_STORAGE_KEY, JSON.stringify(ids));
}

function sourceId(): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `m3u-${uuid.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

function normalizedRemoteUrl(value: string): string {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Playlist URLs must start with http:// or https://.');
  }
  return parsed.toString();
}

function publicLocationLabel(locationType: M3uLocationType, location: string, fileName?: string): string {
  if (locationType === 'local') return fileName || location.split(/[\\/]/).at(-1) || 'Local playlist';
  try {
    return new URL(location).host;
  } catch {
    return 'Remote playlist';
  }
}

function createProfile(
  id: string,
  name: string,
  locationType: M3uLocationType,
  location: string,
  playlist: M3uPlaylist,
  epgUrl: string | undefined,
  refreshIntervalMinutes = 360,
  fileName?: string,
  hasLocalEdits = false,
  editorRefreshPolicy: M3uEditorRefreshPolicy = 'preserve-edits',
  editorWriteBack = false,
): M3uSourceProfile {
  const seriesIds = new Set(
    playlist.entries
      .filter((entry) => entry.type === 'series')
      .map((entry) => entry.episode?.seriesTitle || entry.groupTitle || entry.title),
  );
  return {
    id,
    kind: 'm3u',
    name: name.trim().slice(0, 120) || playlist.name?.slice(0, 120) || fileName || 'M3U Playlist',
    locationType,
    locationLabel: publicLocationLabel(locationType, location, fileName),
    refreshIntervalMinutes: Math.min(10_080, Math.max(15, refreshIntervalMinutes)),
    lastRefreshAt: Date.now(),
    entryCount: playlist.entries.length,
    liveCount: playlist.entries.filter((entry) => entry.type === 'live').length,
    vodCount: playlist.entries.filter((entry) => entry.type === 'vod').length,
    seriesCount: seriesIds.size,
    hasEpg: Boolean(epgUrl || playlist.epgUrls.length),
    hasLocalEdits,
    editorRefreshPolicy,
    editorWriteBack,
  };
}

function parseDocument(id: string, document: M3uDocument, headers?: Record<string, string>): Promise<M3uPlaylist> {
  return parseM3uAsync(document.content, { sourceId: id, baseUrl: document.baseUrl || undefined, headers });
}

function errorMessage(error: unknown): string {
  return getErrorMessage(error, 'Source operation failed without an error message.');
}

let initialization: Promise<void> | null = null;

export const useSourceStore = create<SourceState>((set, get) => ({
  profiles: [],
  runtimes: {},
  enabledSourceIds: [],
  isInitializing: true,
  initializationError: null,

  initialize: async () => {
    if (initialization) return initialization;
    initialization = (async () => {
      set({ isInitializing: true, initializationError: null });
      const profiles = safeProfiles();
      const enabledSourceIds = readEnabledSourceIds(profiles);
      const runtimes: Record<string, M3uSourceRuntime> = Object.fromEntries(
        profiles.map((profile) => [profile.id, { ...emptyRuntime(), status: 'loading' }]),
      );
      set({ profiles, enabledSourceIds, runtimes });

      await Promise.all(profiles.map(async (profile) => {
        try {
          const [connection, cached] = await Promise.all([
            loadM3uConnection(profile.id),
            loadM3uCache(profile.id),
          ]);
          const playlist = cached ? await parseDocument(profile.id, cached, connection?.headers) : null;
          set((state) => ({
            runtimes: {
              ...state.runtimes,
              [profile.id]: {
                connection,
                playlist,
                baseUrl: cached?.baseUrl || undefined,
                status: playlist ? 'ready' : 'idle',
                error: connection || playlist ? null : 'The playlist connection is unavailable',
                revision: playlist ? 1 : 0,
              },
            },
          }));
        } catch (error: unknown) {
          set((state) => ({
            runtimes: {
              ...state.runtimes,
              [profile.id]: {
                ...emptyRuntime(),
                status: 'error',
                error: errorMessage(error),
              },
            },
          }));
        }
      }));

      set({ isInitializing: false });
    })().catch((error: unknown) => {
      set({ isInitializing: false, initializationError: errorMessage(error) });
    }).finally(() => {
      initialization = null;
    });
    return initialization;
  },

  setSourceEnabled: (id, enabled) => {
    if (id !== XTREAM_SOURCE_ID && !id.startsWith('xtream-') && !get().profiles.some((profile) => profile.id === id)) return;
    const enabledSourceIds = enabled
      ? [...new Set([...get().enabledSourceIds, id])]
      : get().enabledSourceIds.filter((candidate) => candidate !== id);
    writeEnabledSourceIds(enabledSourceIds);
    set({ enabledSourceIds });
    void invalidateSourceQueries();
  },

  setEditorRefreshPolicy: (id, policy) => {
    const profiles = get().profiles.map((profile) => profile.id === id ? { ...profile, editorRefreshPolicy: policy } : profile);
    writeProfiles(profiles);
    set({ profiles });
  },

  setEditorWriteBack: (id, enabled) => {
    const profiles = get().profiles.map((profile) => profile.id === id ? { ...profile, editorWriteBack: enabled } : profile);
    writeProfiles(profiles);
    set({ profiles });
  },

  replaceEnabledSourceId: (previousId, nextId) => {
    let stored: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(ENABLED_SOURCE_IDS_STORAGE_KEY) || '[]') as unknown;
      if (Array.isArray(parsed)) stored = parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      // The in-memory selection is still usable.
    }
    const current = [...new Set([...get().enabledSourceIds, ...stored])];
    const shouldEnable = current.includes(previousId);
    const enabledSourceIds = [...new Set([
      ...current.filter((id) => id !== previousId),
      ...(shouldEnable ? [nextId] : []),
    ])];
    writeEnabledSourceIds(enabledSourceIds);
    set({ enabledSourceIds });
    void invalidateSourceQueries();
  },

  addRemoteSource: async (input) => {
    const id = sourceId();
    const location = normalizedRemoteUrl(input.url);
    const epgUrl = input.epgUrl?.trim() ? normalizedRemoteUrl(input.epgUrl) : undefined;
    const headers: Record<string, string> = {};
    if (input.userAgent?.trim()) headers['User-Agent'] = input.userAgent.trim();
    if (input.referrer?.trim()) headers.Referer = input.referrer.trim();
    const connection: M3uConnectionSecret = { location, epgUrl, headers };
    const document = await fetchRemoteM3u(connection, id);
    const playlist = await parseDocument(id, document, connection.headers);
    const profile = createProfile(
      id,
      input.name,
      'remote',
      location,
      playlist,
      epgUrl,
      input.refreshIntervalMinutes,
    );

    try {
      await storeM3uConnection(id, connection);
      await storeM3uCache(id, document);
    } catch (error: unknown) {
      await Promise.allSettled([deleteM3uConnection(id), deleteM3uCache(id)]);
      throw error;
    }
    const previousProfiles = get().profiles;
    const previousEnabledSourceIds = get().enabledSourceIds;
    const profiles = [...previousProfiles, profile];
    const enabledSourceIds = [...new Set([...previousEnabledSourceIds, id])];
    try {
      writeProfiles(profiles);
      writeEnabledSourceIds(enabledSourceIds);
    } catch (error) {
      try { writeProfiles(previousProfiles); } catch { /* best-effort local rollback */ }
      try { writeEnabledSourceIds(previousEnabledSourceIds); } catch { /* best-effort local rollback */ }
      await Promise.allSettled([deleteM3uConnection(id), deleteM3uCache(id)]);
      throw error;
    }
    set((state) => ({
      profiles,
      enabledSourceIds,
      runtimes: {
        ...state.runtimes,
        [id]: { connection, playlist, baseUrl: document.baseUrl || undefined, status: 'ready', error: null, revision: 1 },
      },
    }));
    void invalidateSourceQueries();
    return profile;
  },

  addLocalSource: async (input) => {
    const id = sourceId();
    const document: M3uDocument = {
      content: input.content,
      baseUrl: input.baseUrl || '',
      fileName: input.fileName,
    };
    const playlist = await parseDocument(id, document);
    const connection: M3uConnectionSecret = {
      location: input.path || input.fileName,
      epgUrl: input.epgUrl?.trim() || undefined,
    };
    const profile = createProfile(
      id,
      input.name,
      'local',
      connection.location,
      playlist,
      connection.epgUrl,
      10_080,
      input.fileName,
    );
    try {
      await storeM3uConnection(id, connection);
      await storeM3uCache(id, document);
    } catch (error: unknown) {
      await Promise.allSettled([deleteM3uConnection(id), deleteM3uCache(id)]);
      throw error;
    }
    const previousProfiles = get().profiles;
    const previousEnabledSourceIds = get().enabledSourceIds;
    const profiles = [...previousProfiles, profile];
    const enabledSourceIds = [...new Set([...previousEnabledSourceIds, id])];
    try {
      writeProfiles(profiles);
      writeEnabledSourceIds(enabledSourceIds);
    } catch (error) {
      try { writeProfiles(previousProfiles); } catch { /* best-effort local rollback */ }
      try { writeEnabledSourceIds(previousEnabledSourceIds); } catch { /* best-effort local rollback */ }
      await Promise.allSettled([deleteM3uConnection(id), deleteM3uCache(id)]);
      throw error;
    }
    set((state) => ({
      profiles,
      enabledSourceIds,
      runtimes: {
        ...state.runtimes,
        [id]: { connection, playlist, baseUrl: document.baseUrl || undefined, status: 'ready', error: null, revision: 1 },
      },
    }));
    void invalidateSourceQueries();
    return profile;
  },

  addLocalPath: async (name, path, epgUrl) => {
    const document = await readLocalM3u(path);
    return get().addLocalSource({
      name,
      path,
      epgUrl,
      fileName: document.fileName || path.split(/[\\/]/).at(-1) || 'playlist.m3u',
      content: document.content,
      baseUrl: document.baseUrl,
    });
  },

  updateRemoteSource: async (id, input) => {
    const previous = get().profiles.find((profile) => profile.id === id && profile.locationType === 'remote');
    const previousRuntime = get().runtimes[id];
    if (!previous || !previousRuntime?.connection || !previousRuntime.playlist) throw new Error('Remote playlist not found');
    const location = normalizedRemoteUrl(input.url);
    const epgUrl = input.epgUrl?.trim() ? normalizedRemoteUrl(input.epgUrl) : undefined;
    const headers: Record<string, string> = {};
    if (input.userAgent?.trim()) headers['User-Agent'] = input.userAgent.trim();
    if (input.referrer?.trim()) headers.Referer = input.referrer.trim();
    const connection: M3uConnectionSecret = { location, epgUrl, headers };
    const transportChanged = location !== previousRuntime.connection.location
      || JSON.stringify(headers) !== JSON.stringify(previousRuntime.connection.headers ?? {});
    if (transportChanged && previous.hasLocalEdits && previous.editorRefreshPolicy !== 'replace-edits') {
      throw new Error('This source has edited channels. Allow refresh replacement before changing its playlist URL or request headers.');
    }
    const document = transportChanged ? await fetchRemoteM3u(connection, id) : null;
    const playlist = document ? await parseDocument(id, document, headers) : previousRuntime.playlist;
    const replacingPlaylist = document !== null;
    const profile = createProfile(
      id,
      input.name,
      'remote',
      location,
      playlist,
      epgUrl,
      input.refreshIntervalMinutes ?? previous.refreshIntervalMinutes,
      previous.locationLabel,
      replacingPlaylist ? false : previous.hasLocalEdits === true,
      previous.editorRefreshPolicy || 'preserve-edits',
      previous.editorWriteBack === true,
    );
    const previousCache = document ? await loadM3uCache(id) : null;
    const profiles = get().profiles.map((candidate) => candidate.id === id ? profile : candidate);
    const runtimes = {
      ...get().runtimes,
      [id]: {
        connection,
        playlist,
        baseUrl: document?.baseUrl || previousRuntime.baseUrl,
        status: 'ready' as const,
        error: null,
        revision: (get().runtimes[id]?.revision ?? 0) + 1,
      },
    };
    try {
      await storeM3uConnection(id, connection);
      if (document) await storeM3uCache(id, document);
      writeProfiles(profiles);
    } catch (error) {
      await storeM3uConnection(id, previousRuntime.connection).catch(() => undefined);
      if (document) {
        if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
        else await deleteM3uCache(id).catch(() => undefined);
      }
      throw error;
    }
    set({ profiles, runtimes });
    void invalidateSourceQueries();
    return profile;
  },

  updateLocalSource: async (id, input) => {
    const previous = get().profiles.find((profile) => profile.id === id && profile.locationType === 'local');
    const previousRuntime = get().runtimes[id];
    if (!previous || !previousRuntime?.connection || !previousRuntime.playlist) {
      throw new Error('Local playlist not found');
    }
    let document: M3uDocument | null = null;
    if (input.content !== undefined) {
      document = {
        content: input.content,
        baseUrl: input.baseUrl ?? previousRuntime.baseUrl ?? '',
        fileName: input.fileName || previous.locationLabel,
      };
    } else if (input.path && input.path !== previousRuntime.connection.location) {
      if (previous.hasLocalEdits && previous.editorRefreshPolicy !== 'replace-edits') {
        throw new Error('This source has edited channels. Allow refresh replacement before choosing a different playlist file.');
      }
      document = await readLocalM3u(input.path);
    }
    const location = input.path || previousRuntime.connection.location;
    const connection: M3uConnectionSecret = {
      location,
      epgUrl: input.epgUrl?.trim() || undefined,
    };
    const playlist = document ? await parseDocument(id, document) : previousRuntime.playlist;
    const profile = createProfile(
      id,
      input.name,
      'local',
      location,
      playlist,
      connection.epgUrl,
      previous.refreshIntervalMinutes,
      document?.fileName || input.fileName || previous.locationLabel,
      document ? false : previous.hasLocalEdits === true,
      previous.editorRefreshPolicy || 'preserve-edits',
      previous.editorWriteBack === true,
    );
    const previousCache = document ? await loadM3uCache(id) : null;
    const profiles = get().profiles.map((candidate) => candidate.id === id ? profile : candidate);
    const runtimes = {
      ...get().runtimes,
      [id]: {
        connection,
        playlist,
        baseUrl: document?.baseUrl || previousRuntime.baseUrl,
        status: 'ready' as const,
        error: null,
        revision: (previousRuntime.revision ?? 0) + 1,
      },
    };
    try {
      await storeM3uConnection(id, connection);
      if (document) await storeM3uCache(id, document);
      writeProfiles(profiles);
    } catch (error) {
      await storeM3uConnection(id, previousRuntime.connection).catch(() => undefined);
      if (document) {
        if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
        else await deleteM3uCache(id).catch(() => undefined);
      }
      throw error;
    }
    set({ profiles, runtimes });
    void invalidateSourceQueries();
    return profile;
  },

  saveEditedSource: async (id, content, name) => {
    const profile = get().profiles.find((candidate) => candidate.id === id);
    const runtime = get().runtimes[id];
    if (!profile || !runtime?.connection) throw new Error('The playlist is not available');

    const document: M3uDocument = {
      content,
      baseUrl: runtime.baseUrl || (runtime.connection.location.startsWith('http') ? runtime.connection.location : ''),
      fileName: profile.locationLabel,
    };
    const playlist = await parseDocument(id, document, runtime.connection.headers);
    const previousCache = await loadM3uCache(id) ?? (runtime.playlist ? {
      content: generateM3u(runtime.playlist),
      baseUrl: runtime.baseUrl ?? '',
      fileName: profile.locationLabel,
    } : null);

    const updatedProfile = createProfile(
      id,
      name || profile.name,
      profile.locationType,
      runtime.connection.location,
      playlist,
      runtime.connection.epgUrl,
      profile.refreshIntervalMinutes,
      profile.locationLabel,
      true,
      profile.editorRefreshPolicy || 'preserve-edits',
      profile.editorWriteBack === true,
    );

    const profiles = get().profiles.map((candidate) => candidate.id === id ? updatedProfile : candidate);
    try {
      if (profile.locationType === 'local' && profile.editorWriteBack) {
        await writeLocalM3u(runtime.connection.location, content);
      }
      await storeM3uCache(id, document);
      writeProfiles(profiles);
    } catch (error) {
      if (previousCache) {
        await storeM3uCache(id, previousCache).catch(() => undefined);
        if (profile.locationType === 'local' && profile.editorWriteBack) {
          await writeLocalM3u(runtime.connection.location, previousCache.content).catch(() => undefined);
        }
      } else {
        await deleteM3uCache(id).catch(() => undefined);
      }
      throw error;
    }

    set((state) => ({
      profiles,
      runtimes: {
        ...state.runtimes,
        [id]: {
          ...runtime,
          playlist,
          baseUrl: document.baseUrl || runtime.baseUrl,
          status: 'ready',
          error: null,
          revision: (state.runtimes[id]?.revision ?? 0) + 1,
        },
      },
    }));

    void invalidateSourceQueries();
    return updatedProfile;
  },

  refreshSource: async (id) => {
    const profile = get().profiles.find((candidate) => candidate.id === id);
    const runtime = get().runtimes[id];
    if (!profile || !runtime?.connection) throw new Error('The playlist connection is unavailable');
    if (profile.hasLocalEdits && profile.editorRefreshPolicy === 'preserve-edits') {
      throw new Error('This source has edited channels. Change its editor refresh policy before replacing them with the remote playlist.');
    }
    set((state) => ({
      runtimes: {
        ...state.runtimes,
        [id]: { ...runtime, status: 'loading', error: null },
      },
    }));
    try {
      const document = profile.locationType === 'remote'
        ? await fetchRemoteM3u(runtime.connection, id)
        : await readLocalM3u(runtime.connection.location);
      const playlist = await parseDocument(id, document, runtime.connection.headers);
      const previousCache = await loadM3uCache(id);
      await storeM3uCache(id, document);
      const refreshed = createProfile(
        id,
        profile.name,
        profile.locationType,
        runtime.connection.location,
        playlist,
        runtime.connection.epgUrl,
        profile.refreshIntervalMinutes,
        document.fileName,
        false,
        profile.editorRefreshPolicy || 'preserve-edits',
        profile.editorWriteBack === true,
      );
      const profiles = get().profiles.map((candidate) => candidate.id === id ? refreshed : candidate);
      try {
        writeProfiles(profiles);
      } catch (error) {
        if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
        else await deleteM3uCache(id).catch(() => undefined);
        throw error;
      }
      set((state) => ({
        profiles,
        runtimes: {
          ...state.runtimes,
          [id]: {
            connection: runtime.connection,
            playlist,
            baseUrl: document.baseUrl || undefined,
            status: 'ready',
            error: null,
            revision: (state.runtimes[id]?.revision ?? 0) + 1,
          },
        },
      }));
      void invalidateSourceQueries();
    } catch (error: unknown) {
      set((state) => ({
        runtimes: {
          ...state.runtimes,
          [id]: { ...runtime, status: runtime.playlist ? 'ready' : 'error', error: errorMessage(error) },
        },
      }));
      throw error;
    }
  },

  refreshStaleSources: async () => {
    const now = Date.now();
    const stale = get().profiles.filter((profile) => (
      profile.locationType === 'remote'
      && now - profile.lastRefreshAt >= profile.refreshIntervalMinutes * 60_000
    ));
    await Promise.allSettled(stale.map((profile) => get().refreshSource(profile.id)));
  },

  removeSource: async (id) => {
    const previousProfiles = get().profiles;
    const previousEnabledSourceIds = get().enabledSourceIds;
    const previousConnection = get().runtimes[id]?.connection ?? await loadM3uConnection(id);
    const previousCache = await loadM3uCache(id);
    const profiles = get().profiles.filter((profile) => profile.id !== id);
    const enabledSourceIds = get().enabledSourceIds.filter((candidate) => candidate !== id);
    try {
      await Promise.all([deleteM3uConnection(id), deleteM3uCache(id)]);
      writeProfiles(profiles);
      writeEnabledSourceIds(enabledSourceIds);
    } catch (error) {
      if (previousConnection) await storeM3uConnection(id, previousConnection).catch(() => undefined);
      if (previousCache) await storeM3uCache(id, previousCache).catch(() => undefined);
      try { writeProfiles(previousProfiles); } catch { /* best-effort local rollback */ }
      try { writeEnabledSourceIds(previousEnabledSourceIds); } catch { /* best-effort local rollback */ }
      throw error;
    }
    set((state) => {
      const runtimes = { ...state.runtimes };
      delete runtimes[id];
      return { profiles, runtimes, enabledSourceIds };
    });
    await Promise.allSettled([deleteM3uDraft(id), clearM3uVersions(id)]);
    void invalidateSourceQueries();
  },
}));
