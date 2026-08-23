import { useEffect } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useDownloadStore } from '../store/useDownloadStore';
import { notify } from '../store/useNotificationStore';
import { getUserFacingErrorMessage } from '../utils/error';
import { startQueuedDownloads } from '../services/mediaDownload';
import type { DownloadStatusEvent } from '../utils/downloads';

/** Keeps the persisted queue synchronized with native download lifecycle events. */
export function useDownloadEvents() {
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    const subscription = listen<DownloadStatusEvent>('download-event', ({ payload }) => {
      useDownloadStore.getState().sync(payload);
      const job = useDownloadStore.getState().jobs.find((candidate) => candidate.id === payload.id);
      if (payload.state === 'completed' && job) {
        notify.success('Download Complete', `${job.fileName} was saved successfully.`, undefined, undefined, 'downloads');
      } else if (payload.state === 'failed') {
        notify.error('Download Failed', getUserFacingErrorMessage(payload.error, 'The download failed. Try again in a moment.'), undefined, undefined, 'downloads');
      }
      if (payload.state === 'completed' || payload.state === 'failed' || payload.state === 'cancelled') {
        startQueuedDownloads();
      }
    });
    void subscription.then((unlisten) => {
      if (disposed) unlisten();
      else startQueuedDownloads();
    });
    return () => {
      disposed = true;
      void subscription.then((unlisten) => unlisten());
    };
  }, []);
}
