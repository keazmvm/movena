import { check } from '@tauri-apps/plugin-updater';
import { isTauri } from '../utils/platform';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

let isChecking = false;

export async function checkForAppUpdates(): Promise<{
  available: boolean;
  updateInfo?: UpdateInfo;
  installUpdate?: () => Promise<void>;
  error?: string;
}> {
  if (!isTauri()) {
    return { available: false };
  }

  if (isChecking) {
    return { available: false };
  }

  isChecking = true;
  try {
    const update = await check();
    if (!update) {
      return { available: false };
    }

    return {
      available: true,
      updateInfo: {
        version: update.version,
        currentVersion: update.currentVersion,
        body: update.body ?? undefined,
        date: update.date ?? undefined,
      },
      installUpdate: async () => {
        await update.downloadAndInstall();
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[appUpdater] Update check failed:', message);
    return { available: false, error: message };
  } finally {
    isChecking = false;
  }
}
