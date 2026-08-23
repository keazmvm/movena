import { create } from 'zustand';
import { authenticateXC } from '../api/xc';
import {
  deleteProviderPassword,
  loadProviderPassword,
} from '../services/credentialVault';
import {
  deleteXtreamCredentials,
  loadXtreamCredentials,
  storeXtreamCredentials,
} from '../services/xtreamRepository';
import { registerXtreamServerPromoter } from '../services/xtreamServerEvents';
import { invalidateSourceQueries } from '../api/queryClient';
import { getErrorMessage } from '../utils/error';

export interface XCCredentials {
  /** Runtime source identity; stored only inside that source's vault record. */
  sourceId?: string;
  url: string;
  alternativeUrls?: string[];
  displayName?: string;
  /** Optional source-specific XMLTV override, kept with the secure connection record. */
  epgUrl?: string;
  username: string;
  password: string;
}

export interface XCUserInfo {
  username: string;
  password?: string;
  message: string;
  auth: number;
  status: string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface XCServerInfo {
  url: string;
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timestamp_now: number;
  time_now: string;
  timezone: string;
}

export interface XtreamSourceProfile {
  id: string;
  kind: 'xtream';
  name: string;
  locationLabel: string;
  username: string;
  userInfo: XCUserInfo;
  serverInfo: XCServerInfo;
  createdAt: number;
  updatedAt: number;
}

export interface XtreamSourceRuntime {
  credentials: XCCredentials | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  revision: number;
}

interface StoredAuthProfile {
  version: 2;
  credentials: Omit<XCCredentials, 'password'>;
  userInfo: XCUserInfo;
  serverInfo: XCServerInfo;
}

interface LegacyPersistedAuth {
  state?: {
    credentials?: XCCredentials | null;
    userInfo?: XCUserInfo | null;
    serverInfo?: XCServerInfo | null;
  };
}

export interface SaveXtreamSourceInput extends XCCredentials {
  name?: string;
}

interface AuthState {
  profiles: XtreamSourceProfile[];
  runtimes: Record<string, XtreamSourceRuntime>;
  credentials: XCCredentials | null;
  userInfo: XCUserInfo | null;
  serverInfo: XCServerInfo | null;
  isInitializing: boolean;
  initializationError: string | null;
  initialize: () => Promise<void>;
  addSource: (input: SaveXtreamSourceInput) => Promise<XtreamSourceProfile>;
  updateSource: (sourceId: string, input: SaveXtreamSourceInput) => Promise<XtreamSourceProfile>;
  testSource: (sourceId: string) => Promise<void>;
  setSourceEpgUrl: (sourceId: string, epgUrl?: string) => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  setAuth: (creds: XCCredentials, user: XCUserInfo, server: XCServerInfo) => Promise<void>;
  promoteServer: (url: string) => void;
  promoteSourceServer: (sourceId: string, url: string) => void;
  logout: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const AUTH_PROFILE_STORAGE_KEY = 'movena-auth-profile-v2';
export const LEGACY_AUTH_STORAGE_KEY = 'iptv-auth-storage';
export const XTREAM_PROFILES_STORAGE_KEY = 'movena-xtream-source-profiles-v1';
export const LEGACY_XTREAM_SOURCE_ID = 'xtream-legacy';

function sourceId(): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `xtream-${uuid.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

function providerHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 200);
  }
}

function sanitizeUserInfo(userInfo: XCUserInfo): XCUserInfo {
  return { ...userInfo, password: undefined };
}

function makeProfile(
  id: string,
  input: SaveXtreamSourceInput,
  userInfo: XCUserInfo,
  serverInfo: XCServerInfo,
  createdAt = Date.now(),
): XtreamSourceProfile {
  return {
    id,
    kind: 'xtream',
    name: (input.name || input.displayName || providerHost(input.url) || 'Xtream').trim().slice(0, 120),
    locationLabel: providerHost(input.url),
    username: input.username,
    userInfo: sanitizeUserInfo(userInfo),
    serverInfo,
    createdAt,
    updatedAt: Date.now(),
  };
}

function safeProfiles(): XtreamSourceProfile[] {
  try {
    const raw = localStorage.getItem(XTREAM_PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): XtreamSourceProfile[] => {
      if (!value || typeof value !== 'object') return [];
      const profile = value as Partial<XtreamSourceProfile>;
      if (
        profile.kind !== 'xtream'
        || typeof profile.id !== 'string'
        || !/^xtream-[a-z0-9-]{6,}$/i.test(profile.id)
        || typeof profile.name !== 'string'
        || typeof profile.username !== 'string'
        || !profile.userInfo
        || !profile.serverInfo
      ) return [];
      return [{
        ...profile,
        name: profile.name.trim().slice(0, 120) || 'Xtream',
        locationLabel: typeof profile.locationLabel === 'string' ? profile.locationLabel.slice(0, 200) : 'Provider server',
        userInfo: sanitizeUserInfo(profile.userInfo),
        createdAt: typeof profile.createdAt === 'number' ? profile.createdAt : Date.now(),
        updatedAt: typeof profile.updatedAt === 'number' ? profile.updatedAt : Date.now(),
      } as XtreamSourceProfile];
    });
  } catch {
    return [];
  }
}

function writeProfiles(profiles: XtreamSourceProfile[]): void {
  localStorage.setItem(XTREAM_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function readLegacyProfile(): { profile: StoredAuthProfile; password: string } | null {
  try {
    const rawV2 = localStorage.getItem(AUTH_PROFILE_STORAGE_KEY);
    if (rawV2) {
      const profile = JSON.parse(rawV2) as StoredAuthProfile;
      if (profile.version === 2 && profile.credentials?.url && profile.credentials.username && profile.userInfo && profile.serverInfo) {
        return { profile, password: '' };
      }
    }
    const raw = localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as LegacyPersistedAuth;
    const credentials = legacy.state?.credentials;
    const userInfo = legacy.state?.userInfo;
    const serverInfo = legacy.state?.serverInfo;
    if (!credentials?.url || !credentials.username || !credentials.password || !userInfo || !serverInfo) return null;
    const { password, ...publicCredentials } = credentials;
    return {
      password,
      profile: {
        version: 2,
        credentials: publicCredentials,
        userInfo: sanitizeUserInfo(userInfo),
        serverInfo,
      },
    };
  } catch {
    return null;
  }
}

function aliases(profiles: XtreamSourceProfile[], runtimes: Record<string, XtreamSourceRuntime>) {
  const profile = profiles.find((candidate) => runtimes[candidate.id]?.credentials) ?? profiles[0];
  return {
    credentials: profile ? runtimes[profile.id]?.credentials ?? null : null,
    userInfo: profile?.userInfo ?? null,
    serverInfo: profile?.serverInfo ?? null,
  };
}

const serverPromotionQueues = new Map<string, Promise<void>>();

async function persistServerPromotion(sourceId: string, promoted: XCCredentials): Promise<void> {
  await storeXtreamCredentials(sourceId, promoted);

  const currentState = useAuthStore.getState();
  const currentRuntime = currentState.runtimes[sourceId];
  if (currentRuntime?.credentials !== promoted) {
    if (currentRuntime?.credentials) await storeXtreamCredentials(sourceId, currentRuntime.credentials);
  }
}

function queueServerPromotion(
  sourceId: string,
  promoted: XCCredentials,
  previousCredentials: XCCredentials,
): Promise<void> {
  const previous = serverPromotionQueues.get(sourceId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    try {
      await persistServerPromotion(sourceId, promoted);
    } catch (error) {
      const currentState = useAuthStore.getState();
      const currentRuntime = currentState.runtimes[sourceId];
      if (currentRuntime?.credentials === promoted) {
        const runtimes = {
          ...currentState.runtimes,
          [sourceId]: {
            ...currentRuntime,
            credentials: previousCredentials,
            revision: currentRuntime.revision + 1,
          },
        };
        useAuthStore.setState({ runtimes, ...aliases(currentState.profiles, runtimes) });
      }
      throw error;
    }
  });
  serverPromotionQueues.set(sourceId, next);
  void next.finally(() => {
    if (serverPromotionQueues.get(sourceId) === next) serverPromotionQueues.delete(sourceId);
  }).catch(() => undefined);
  return next;
}

function promoteServerCredentials(credentials: XCCredentials, sourceId: string, url: string): XCCredentials {
  const alternativeUrls = [credentials.url, ...(credentials.alternativeUrls ?? [])]
    .filter((candidate, index, urls) => candidate !== url && urls.indexOf(candidate) === index);
  return { ...credentials, sourceId, url, alternativeUrls };
}

function errorMessage(error: unknown): string {
  return getErrorMessage(error, 'Credential operation failed without an error message.');
}

let initialization: Promise<void> | null = null;

export const selectIsAuthenticated = (state: AuthState) =>
  !state.isInitializing && state.profiles.some((profile) => (
    state.runtimes[profile.id]?.credentials && profile.userInfo.auth === 1
  ));

export const useAuthStore = create<AuthState>((set, get) => ({
  profiles: [],
  runtimes: {},
  credentials: null,
  userInfo: null,
  serverInfo: null,
  isInitializing: true,
  initializationError: null,

  initialize: async () => {
    if (initialization) return initialization;
    set({ isInitializing: true, initializationError: null });
    initialization = (async () => {
      try {
        let profiles = safeProfiles();
        let legacyMigrated = false;
        if (profiles.length === 0) {
          const legacy = readLegacyProfile();
          if (legacy) {
            const vaultPassword = legacy.password || await loadProviderPassword();
            if (vaultPassword) {
              const credentials: XCCredentials = { ...legacy.profile.credentials, password: vaultPassword, sourceId: LEGACY_XTREAM_SOURCE_ID };
              const profile = makeProfile(
                LEGACY_XTREAM_SOURCE_ID,
                credentials,
                legacy.profile.userInfo,
                legacy.profile.serverInfo,
              );
              await storeXtreamCredentials(profile.id, credentials);
              profiles = [profile];
              legacyMigrated = true;
              writeProfiles(profiles);
              const { useSourceStore } = await import('./useSourceStore');
              useSourceStore.getState().replaceEnabledSourceId('xtream', profile.id);
            }
          }
        }

        const runtimes: Record<string, XtreamSourceRuntime> = {};
        await Promise.all(profiles.map(async (profile) => {
          try {
            const restored = await loadXtreamCredentials(profile.id);
            const credentials = restored ? { ...restored, sourceId: profile.id } : null;
            runtimes[profile.id] = {
              credentials,
              status: credentials ? 'ready' : 'error',
              error: credentials ? null : 'The saved credential is unavailable',
              revision: credentials ? 1 : 0,
            };
          } catch (error: unknown) {
            runtimes[profile.id] = { credentials: null, status: 'error', error: errorMessage(error), revision: 0 };
          }
        }));
        if (profiles.length > 0 || legacyMigrated) {
          localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
          localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
          await deleteProviderPassword();
        }
        set({ profiles, runtimes, ...aliases(profiles, runtimes), isInitializing: false });
      } catch (error: unknown) {
        set({ isInitializing: false, initializationError: errorMessage(error) });
      } finally {
        initialization = null;
      }
    })();
    return initialization;
  },

  addSource: async (input) => {
    const response = await authenticateXC(input);
    const id = sourceId();
    const credentials: XCCredentials = { ...input, sourceId: id, displayName: input.name || input.displayName };
    const profile = makeProfile(id, input, response.user_info, response.server_info);
    await storeXtreamCredentials(id, credentials);
    const profiles = [...get().profiles, profile];
    const runtimes = {
      ...get().runtimes,
      [id]: { credentials, status: 'ready' as const, error: null, revision: 1 },
    };
    try {
      writeProfiles(profiles);
    } catch (error) {
      await deleteXtreamCredentials(id).catch(() => undefined);
      throw error;
    }
    set({ profiles, runtimes, ...aliases(profiles, runtimes), initializationError: null });
    const { useSourceStore } = await import('./useSourceStore');
    useSourceStore.getState().setSourceEnabled(id, true);
    return profile;
  },

  updateSource: async (id, input) => {
    const previous = get().profiles.find((profile) => profile.id === id);
    if (!previous) throw new Error('Xtream source not found');
    const response = await authenticateXC(input);
    const credentials: XCCredentials = { ...input, sourceId: id, displayName: input.name || input.displayName };
    const profile = makeProfile(id, input, response.user_info, response.server_info, previous.createdAt);
    const scopedCredentials = { ...credentials, sourceId: id };
    const previousCredentials = get().runtimes[id]?.credentials ?? null;
    await storeXtreamCredentials(id, scopedCredentials);
    const profiles = get().profiles.map((candidate) => candidate.id === id ? profile : candidate);
    const runtimes = {
      ...get().runtimes,
      [id]: {
        credentials,
        status: 'ready' as const,
        error: null,
        revision: (get().runtimes[id]?.revision ?? 0) + 1,
      },
    };
    try {
      writeProfiles(profiles);
    } catch (error) {
      if (previousCredentials) await storeXtreamCredentials(id, previousCredentials).catch(() => undefined);
      else await deleteXtreamCredentials(id).catch(() => undefined);
      throw error;
    }
    set({ profiles, runtimes, ...aliases(profiles, runtimes), initializationError: null });
    void invalidateSourceQueries();
    return profile;
  },

  testSource: async (id) => {
    const runtime = get().runtimes[id];
    if (!runtime?.credentials) throw new Error('The saved credential is unavailable');
    set((state) => ({ runtimes: { ...state.runtimes, [id]: { ...runtime, status: 'loading', error: null } } }));
    try {
      const response = await authenticateXC(runtime.credentials);
      const previous = get().profiles.find((profile) => profile.id === id);
      if (!previous) throw new Error('Xtream source not found');
      const profile = makeProfile(id, { ...runtime.credentials, name: previous.name }, response.user_info, response.server_info, previous.createdAt);
      const profiles = get().profiles.map((candidate) => candidate.id === id ? profile : candidate);
      const runtimes = {
        ...get().runtimes,
        [id]: { ...runtime, status: 'ready' as const, error: null, revision: runtime.revision + 1 },
      };
      writeProfiles(profiles);
      set({ profiles, runtimes, ...aliases(profiles, runtimes) });
      void invalidateSourceQueries();
    } catch (error: unknown) {
      set((state) => ({
        runtimes: {
          ...state.runtimes,
          [id]: { ...runtime, status: 'error', error: errorMessage(error) },
        },
      }));
      throw error;
    }
  },

  setSourceEpgUrl: async (id, epgUrl) => {
    const runtime = get().runtimes[id];
    if (!runtime?.credentials) throw new Error('The saved credential is unavailable');
    const credentials = { ...runtime.credentials, epgUrl: epgUrl?.trim() || undefined };
    await storeXtreamCredentials(id, credentials);
    const runtimes = {
      ...get().runtimes,
      [id]: { ...runtime, credentials, revision: runtime.revision + 1 },
    };
    set({ runtimes, ...aliases(get().profiles, runtimes) });
    void invalidateSourceQueries();
  },

  removeSource: async (id) => {
    const previousCredentials = get().runtimes[id]?.credentials ?? null;
    await deleteXtreamCredentials(id);
    const profiles = get().profiles.filter((profile) => profile.id !== id);
    const runtimes = { ...get().runtimes };
    delete runtimes[id];
    try {
      writeProfiles(profiles);
    } catch (error) {
      if (previousCredentials) await storeXtreamCredentials(id, previousCredentials).catch(() => undefined);
      throw error;
    }
    set({ profiles, runtimes, ...aliases(profiles, runtimes) });
    const { useSourceStore } = await import('./useSourceStore');
    useSourceStore.getState().setSourceEnabled(id, false);
  },

  setAuth: async (credentials, userInfo, serverInfo) => {
    const existing = get().profiles[0];
    const id = existing?.id ?? sourceId();
    const scopedCredentials = { ...credentials, sourceId: id };
    const profile = makeProfile(id, scopedCredentials, userInfo, serverInfo, existing?.createdAt);
    await storeXtreamCredentials(id, scopedCredentials);
    const profiles = existing
      ? get().profiles.map((candidate) => candidate.id === id ? profile : candidate)
      : [profile];
    const runtimes = {
      ...get().runtimes,
      [id]: { credentials: scopedCredentials, status: 'ready' as const, error: null, revision: (get().runtimes[id]?.revision ?? 0) + 1 },
    };
    try {
      writeProfiles(profiles);
    } catch (error) {
      const previousCredentials = existing ? get().runtimes[id]?.credentials : null;
      if (previousCredentials) await storeXtreamCredentials(id, previousCredentials).catch(() => undefined);
      else await deleteXtreamCredentials(id).catch(() => undefined);
      throw error;
    }
    localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    set({ profiles, runtimes, ...aliases(profiles, runtimes), initializationError: null });
    void invalidateSourceQueries();
  },

  promoteServer: (url) => {
    const profile = get().profiles.find((candidate) => get().runtimes[candidate.id]?.credentials);
    if (!profile) return;
    const runtime = get().runtimes[profile.id];
    const credentials = runtime.credentials;
    if (!credentials || credentials.url === url) return;
    const promoted = promoteServerCredentials(credentials, profile.id, url);
    const runtimes = { ...get().runtimes, [profile.id]: { ...runtime, credentials: promoted, revision: runtime.revision + 1 } };
    set({ runtimes, ...aliases(get().profiles, runtimes) });
    void queueServerPromotion(profile.id, promoted, credentials).catch(() => undefined);
  },

  promoteSourceServer: (id, url) => {
    const runtime = get().runtimes[id];
    const credentials = runtime?.credentials;
    if (!credentials || credentials.url === url) return;
    const promoted = promoteServerCredentials(credentials, id, url);
    const runtimes = { ...get().runtimes, [id]: { ...runtime, credentials: promoted, revision: runtime.revision + 1 } };
    set({ runtimes, ...aliases(get().profiles, runtimes) });
    void queueServerPromotion(id, promoted, credentials).catch(() => undefined);
  },

  logout: async () => {
    const profile = get().profiles.find((candidate) => get().runtimes[candidate.id]?.credentials) ?? get().profiles[0];
    if (profile) await get().removeSource(profile.id);
    localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    await deleteProviderPassword();
  },

  isAuthenticated: () => selectIsAuthenticated(get()),
}));

export function getXtreamCredentials(sourceId?: string): XCCredentials | null {
  const state = useAuthStore.getState();
  if (sourceId === 'xtream') sourceId = state.profiles[0]?.id;
  if (sourceId) return state.runtimes[sourceId]?.credentials ?? null;
  return state.profiles.map((profile) => state.runtimes[profile.id]?.credentials).find(Boolean) ?? null;
}

export function getLegacyXtreamSourceId(): string | undefined {
  return useAuthStore.getState().profiles[0]?.id;
}

export function resolveXtreamSourceId(sourceId?: string): string | undefined {
  return !sourceId || sourceId === 'xtream' ? getLegacyXtreamSourceId() : sourceId;
}

registerXtreamServerPromoter((sourceId, url) => {
  if (sourceId) useAuthStore.getState().promoteSourceServer(sourceId, url);
  else useAuthStore.getState().promoteServer(url);
});
