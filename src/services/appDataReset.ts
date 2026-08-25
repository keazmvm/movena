import { desktopApi } from '../api/desktop';
import { tauriApi } from '../api/ipc';
import { queryClient } from '../api/queryClient';
import { deleteProviderPassword } from './credentialVault';
import { deleteM3uCache, deleteM3uConnection } from './m3uRepository';
import { deleteXtreamCredentials } from './xtreamRepository';
import {
  ACTIVE_SOURCE_STORAGE_KEY,
  ENABLED_SOURCE_IDS_STORAGE_KEY,
  SOURCE_PROFILES_STORAGE_KEY,
  useSourceStore,
} from '../store/useSourceStore';
import {
  AUTH_PROFILE_STORAGE_KEY,
  LEGACY_AUTH_STORAGE_KEY,
  XTREAM_PROFILES_STORAGE_KEY,
  useAuthStore,
} from '../store/useAuthStore';
import { useDownloadStore } from '../store/useDownloadStore';
import { useLibraryStore } from '../store/useLibraryStore';
import { useSearchStore } from '../store/useSearchStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useDebugStore } from '../store/useDebugStore';
import { useNotificationStore } from '../store/useNotificationStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useStreamVerificationStore } from '../store/useStreamVerificationStore';
import { clearPlaybackRecovery } from '../utils/playbackRecovery';
import {
  clearM3uEditorStorageMemory,
  deleteLegacyM3uEditorDatabase,
} from './m3uEditorStorage';
import { TRANSFORM_PRESET_KEY } from '../utils/m3uEditor';
import { deleteTmdbApiKey } from './tmdbCredentialVault';

const PERSISTED_STORAGE_KEYS = [
  'iptv-settings-storage',
  'iptv-library-storage',
  'movena-downloads-v1',
  'iptv-search-storage',
  'movena-stream-verification',
  'movena-playback-recovery-v1',
  'movena-m3u-editor-filters-v1',
  TRANSFORM_PRESET_KEY,
  SOURCE_PROFILES_STORAGE_KEY,
  ENABLED_SOURCE_IDS_STORAGE_KEY,
  ACTIVE_SOURCE_STORAGE_KEY,
  XTREAM_PROFILES_STORAGE_KEY,
  AUTH_PROFILE_STORAGE_KEY,
  LEGACY_AUTH_STORAGE_KEY,
];

/**
 * Erases all data managed by Movena. Original playlist files and completed
 * downloads are deliberately not touched because they may live in arbitrary
 * user-selected folders outside the app's data directory.
 */
export async function clearAllAppData(): Promise<void> {
  const m3uSourceIds = useSourceStore.getState().profiles.map((profile) => profile.id);
  const xtreamSourceIds = useAuthStore.getState().profiles.map((profile) => profile.id);
  const sourceIds = [...new Set([...m3uSourceIds, ...xtreamSourceIds])];
  const activeDownloadIds = useDownloadStore.getState().jobs
    .filter((job) => ['downloading', 'paused'].includes(job.state))
    .map((job) => job.id);

  await queryClient.cancelQueries();
  await deleteTmdbApiKey();
  usePlayerStore.getState().closePlayer();

  if (desktopApi.isDesktop()) {
    await Promise.allSettled(activeDownloadIds.map((id) => tauriApi.downloadMediaCancel(id)));
    await tauriApi.mpvStop();
    await tauriApi.appDataClear(sourceIds);
  } else {
    await Promise.all([
      ...m3uSourceIds.flatMap((id) => [deleteM3uConnection(id), deleteM3uCache(id)]),
      ...xtreamSourceIds.map((id) => deleteXtreamCredentials(id)),
      deleteProviderPassword(),
    ]);
  }

  useSourceStore.setState({
    profiles: [],
    runtimes: {},
    enabledSourceIds: [],
    isInitializing: false,
    initializationError: null,
  });
  useAuthStore.setState({
    profiles: [],
    runtimes: {},
    credentials: null,
    userInfo: null,
    serverInfo: null,
    isInitializing: false,
    initializationError: null,
  });
  useLibraryStore.setState({ favorites: [], collections: [], history: [], watched: [] });
  useDownloadStore.setState({ jobs: [] });
  useSearchStore.setState({ recentSearches: [] });
  useStreamVerificationStore.setState({ verifiedStreams: {} });
  useDebugStore.getState().clearLogs();
  useDebugStore.getState().clearNetworkLogs();
  useSettingsStore.getState().resetSettings();
  useNotificationStore.getState().clearAll();
  queryClient.clear();

  // Clear persist middleware first so the debounced library writer cannot
  // recreate its storage key after this operation completes.
  useSettingsStore.persist.clearStorage();
  useLibraryStore.persist.clearStorage();
  useDownloadStore.persist.clearStorage();
  useSearchStore.persist.clearStorage();
  useStreamVerificationStore.persist.clearStorage();
  clearPlaybackRecovery();
  clearM3uEditorStorageMemory();
  await deleteLegacyM3uEditorDatabase().catch(() => {});
  PERSISTED_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('movena-m3u-editor-draft-v1:')) localStorage.removeItem(key);
  }
}
