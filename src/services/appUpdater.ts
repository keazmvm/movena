import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from '../utils/platform';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface UpdateDownloadProgress {
  /** Bytes downloaded so far. */
  downloaded: number;
  /** Total size in bytes, or null when the server didn't report a length. */
  total: number | null;
}

let isChecking = false;

export async function checkForAppUpdates(): Promise<{
  available: boolean;
  updateInfo?: UpdateInfo;
  /** The live update handle — pass to {@link installAppUpdate} to download it. */
  update?: Update;
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
      update,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[appUpdater] Update check failed:', message);
    return { available: false, error: message };
  } finally {
    isChecking = false;
  }
}

/**
 * Downloads and installs an update found by {@link checkForAppUpdates}, then
 * relaunches the app so the new version actually takes effect.
 *
 * Restarting is not optional here: on macOS the plugin only swaps the
 * installed .app bundle on disk — nothing visibly happens until the process
 * restarts, which is exactly why an update used to look like it silently did
 * nothing until the app was later closed by hand. Folding the relaunch into
 * this call means every caller gets it for free instead of having to
 * remember it.
 */
export async function installAppUpdate(
  update: Update,
  options: {
    onProgress?: (progress: UpdateDownloadProgress) => void;
    /** Fires once install has finished, right before the app relaunches. */
    onInstalled?: () => void;
  } = {},
): Promise<void> {
  const { onProgress, onInstalled } = options;
  let downloaded = 0;
  let total: number | null = null;

  try {
    await update.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case 'Started':
          total = event.data.contentLength ?? null;
          onProgress?.({ downloaded, total });
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          onProgress?.({ downloaded, total });
          break;
        case 'Finished':
          if (total !== null) downloaded = total;
          onProgress?.({ downloaded, total });
          break;
      }
    });
  } finally {
    // Release the backend resource handle regardless of outcome. Errors here
    // are not worth surfacing — the app is either about to relaunch or the
    // caller already has a real error from downloadAndInstall to show.
    await update.close().catch(() => {});
  }

  onInstalled?.();
  await relaunch();
}
