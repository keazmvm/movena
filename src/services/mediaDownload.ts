import { tauriApi } from '../api/ipc';
import { getUserFacingErrorMessage } from '../utils/error';
import { useDownloadStore } from '../store/useDownloadStore';
import { notify } from '../store/useNotificationStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { sanitizeDownloadFileName } from '../utils/downloads';

export interface DownloadableMediaItem {
  title: string;
  type?: 'live' | 'vod' | 'series' | undefined;
  streamUrl?: string | undefined;
  httpHeaders?: Record<string, string> | undefined;
  containerExtension?: string | undefined;
}

export interface MediaDownloadRequest {
  url: string;
  fileName: string;
  headers?: Record<string, string> | undefined;
  id?: string | undefined;
  force?: boolean | undefined;
}

/** Builds the consistent file name and transport details for catalogue media. */
export function downloadMediaItem(item: DownloadableMediaItem): Promise<string | null> {
  const extension = (item.containerExtension || 'mp4').replace(/^\./, '').trim() || 'mp4';
  return startMediaDownload({
    url: item.streamUrl || '',
    fileName: sanitizeDownloadFileName(`${item.title}.${extension}`),
    headers: item.httpHeaders,
  });
}

function createDownloadId() {
  return `download-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Starts one native media download and mirrors its lifecycle in the download store. */
export async function startMediaDownload(request: MediaDownloadRequest): Promise<string | null> {
  const url = request.url.trim();
  if (!url) {
    notify.warning('Download Unavailable', 'This media does not have a downloadable source URL.', undefined, undefined, 'downloads');
    return null;
  }

  const store = useDownloadStore.getState();
  const duplicate = request.id
    ? undefined
    : store.jobs.find((job) => job.sourceUrl === url && job.fileName === request.fileName && ['queued', 'downloading', 'paused'].includes(job.state));
  if (duplicate) {
    notify.info('Download Already Queued', `${request.fileName} is already in Downloads.`, undefined, undefined, 'downloads');
    return null;
  }
  const id = request.id ?? createDownloadId();
  if (!store.jobs.some((job) => job.id === id)) {
    store.enqueue({ id, sourceUrl: url, headers: request.headers, fileName: request.fileName });
  }

  const settings = useSettingsStore.getState();
  const activeCount = useDownloadStore.getState().jobs.filter((job) => job.state === 'downloading').length;
  if (activeCount >= settings.maxConcurrentDownloads) {
    notify.info('Download Queued', `${request.fileName} will start when a download slot is available.`, undefined, undefined, 'downloads');
    return null;
  }
  if (!request.force && !settings.autoStartDownloads) {
    notify.info('Download Queued', `${request.fileName} will start when you choose Start.`, undefined, undefined, 'downloads');
    return null;
  }

  useDownloadStore.getState().start(id);
  const startedJob = useDownloadStore.getState().jobs.find((job) => job.id === id);
  if (startedJob?.state !== 'downloading') {
    notify.info('Download Already Active', `${request.fileName} is already in Downloads.`, undefined, undefined, 'downloads');
    return null;
  }

  notify.info('Download Started', `${request.fileName} is being saved to Downloads.`, undefined, undefined, 'downloads');
  try {
    await tauriApi.downloadMediaStart({
      id,
      url,
      fileName: request.fileName,
      headers: request.headers,
      directory: settings.downloadDirectory || undefined,
    });
    return null;
  } catch (error: unknown) {
    const message = getUserFacingErrorMessage(error, 'The download failed. Try again in a moment.');
    useDownloadStore.getState().fail(id, message);
    notify.error('Download Failed', message, undefined, undefined, 'downloads');
    return null;
  }
}

export function startQueuedDownloads() {
  const settings = useSettingsStore.getState();
  if (!settings.autoStartDownloads) return;
  const jobs = useDownloadStore.getState().jobs;
  let slots = settings.maxConcurrentDownloads - jobs.filter((job) => job.state === 'downloading').length;
  for (const job of jobs.filter((candidate) => candidate.state === 'queued')) {
    if (slots <= 0) break;
    slots -= 1;
    void startMediaDownload({
      id: job.id,
      url: job.sourceUrl,
      fileName: job.fileName,
      headers: job.headers,
      force: true,
    });
  }
}
