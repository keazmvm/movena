import { beforeEach, describe, expect, it, vi } from 'vitest';

const { downloadMediaStart } = vi.hoisted(() => ({
  downloadMediaStart: vi.fn(),
}));

vi.mock('../../src/api/ipc', () => ({
  tauriApi: { downloadMediaStart },
}));

import { downloadMediaItem, startMediaDownload, startQueuedDownloads } from '../../src/services/mediaDownload';
import { useDownloadStore } from '../../src/store/useDownloadStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';
import { notify } from '../../src/store/useNotificationStore';

function activeJobCount() {
  return useDownloadStore.getState().jobs.filter((job) => job.state === 'downloading').length;
}

beforeEach(() => {
  localStorage.clear();
  downloadMediaStart.mockReset().mockResolvedValue(undefined);
  useDownloadStore.setState({ jobs: [] });
  useSettingsStore.getState().resetSettings();
  useSettingsStore.setState({
    maxConcurrentDownloads: 2,
    autoStartDownloads: true,
    downloadDirectory: '',
  });
  vi.spyOn(notify, 'success').mockImplementation(() => '');
  vi.spyOn(notify, 'error').mockImplementation(() => '');
  vi.spyOn(notify, 'warning').mockImplementation(() => '');
  vi.spyOn(notify, 'info').mockImplementation(() => '');
});

describe('startMediaDownload', () => {
  it('refuses a request with no source URL', async () => {
    const result = await startMediaDownload({ url: '   ', fileName: 'Movie.mp4' });

    expect(result).toBeNull();
    expect(notify.warning).toHaveBeenCalledWith('Download Unavailable', expect.any(String), undefined, undefined, 'downloads');
    expect(useDownloadStore.getState().jobs).toHaveLength(0);
    expect(downloadMediaStart).not.toHaveBeenCalled();
  });

  it('starts a download immediately when auto-start is on and a slot is free', async () => {
    const result = await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4' });

    expect(result).toBeNull();
    expect(downloadMediaStart).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://cdn.test/movie.mp4',
      fileName: 'Movie.mp4',
      directory: undefined,
    }));
    expect(notify.info).toHaveBeenCalledWith('Download Started', expect.any(String), undefined, undefined, 'downloads');
    expect(useDownloadStore.getState().jobs).toHaveLength(1);
    expect(useDownloadStore.getState().jobs[0]?.state).toBe('downloading');
  });

  it('passes the configured download directory through to the native start call', async () => {
    useSettingsStore.setState({ downloadDirectory: '/Users/me/Movies' });

    await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4' });

    expect(downloadMediaStart).toHaveBeenCalledWith(expect.objectContaining({ directory: '/Users/me/Movies' }));
  });

  it('will not queue the same source and file name twice', async () => {
    await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4' });
    downloadMediaStart.mockClear();

    const result = await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4' });

    expect(result).toBeNull();
    expect(notify.info).toHaveBeenCalledWith('Download Already Queued', expect.any(String), undefined, undefined, 'downloads');
    expect(useDownloadStore.getState().jobs).toHaveLength(1);
    expect(downloadMediaStart).not.toHaveBeenCalled();
  });

  it('queues without starting once every download slot is occupied', async () => {
    useSettingsStore.setState({ maxConcurrentDownloads: 1 });
    await startMediaDownload({ url: 'https://cdn.test/one.mp4', fileName: 'One.mp4' });
    downloadMediaStart.mockClear();

    const result = await startMediaDownload({ url: 'https://cdn.test/two.mp4', fileName: 'Two.mp4' });

    expect(result).toBeNull();
    expect(notify.info).toHaveBeenCalledWith('Download Queued', expect.stringContaining('download slot'), undefined, undefined, 'downloads');
    expect(downloadMediaStart).not.toHaveBeenCalled();
    const queued = useDownloadStore.getState().jobs.find((job) => job.fileName === 'Two.mp4');
    expect(queued?.state).toBe('queued');
  });

  it('queues without starting when auto-start is off and the caller does not force it', async () => {
    useSettingsStore.setState({ autoStartDownloads: false });

    const result = await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4' });

    expect(result).toBeNull();
    expect(notify.info).toHaveBeenCalledWith('Download Queued', expect.stringContaining('Start'), undefined, undefined, 'downloads');
    expect(downloadMediaStart).not.toHaveBeenCalled();
    expect(useDownloadStore.getState().jobs[0]?.state).toBe('queued');
  });

  it('force-starts even when auto-start is off', async () => {
    useSettingsStore.setState({ autoStartDownloads: false });

    await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4', force: true });

    expect(downloadMediaStart).toHaveBeenCalledTimes(1);
    expect(useDownloadStore.getState().jobs[0]?.state).toBe('downloading');
  });

  it('reports a job that cannot legally restart as already active instead of erroring', async () => {
    useDownloadStore.setState({
      jobs: [{
        id: 'stuck-job',
        sourceUrl: 'https://cdn.test/movie.mp4',
        fileName: 'Movie.mp4',
        state: 'completed',
        progress: 1,
        attempts: 1,
        maxAttempts: 3,
        downloadedBytes: 100,
        totalBytes: 100,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    });

    const result = await startMediaDownload({ id: 'stuck-job', url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4', force: true });

    expect(result).toBeNull();
    expect(notify.info).toHaveBeenCalledWith('Download Already Active', expect.any(String), undefined, undefined, 'downloads');
    expect(downloadMediaStart).not.toHaveBeenCalled();
  });

  it('marks the job failed and notifies when the native call rejects', async () => {
    downloadMediaStart.mockRejectedValueOnce(new Error('disk full'));

    await startMediaDownload({ url: 'https://cdn.test/movie.mp4', fileName: 'Movie.mp4' });

    expect(notify.error).toHaveBeenCalledWith('Download Failed', expect.any(String), undefined, undefined, 'downloads');
    expect(useDownloadStore.getState().jobs[0]?.state).toBe('failed');
  });
});

describe('downloadMediaItem', () => {
  it('builds a sanitized file name from the title and container extension', async () => {
    await downloadMediaItem({ title: 'My Movie', containerExtension: '.mkv', streamUrl: 'https://cdn.test/x.mkv' });

    expect(downloadMediaStart).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'My Movie.mkv', url: 'https://cdn.test/x.mkv' }));
  });

  it('defaults to an mp4 container when none is provided', async () => {
    await downloadMediaItem({ title: 'My Movie', streamUrl: 'https://cdn.test/x' });

    expect(downloadMediaStart).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'My Movie.mp4' }));
  });

  it('forwards playback headers to the native download call', async () => {
    await downloadMediaItem({ title: 'My Movie', streamUrl: 'https://cdn.test/x.mp4', httpHeaders: { Referer: 'https://portal.test' } });

    expect(downloadMediaStart).toHaveBeenCalledWith(expect.objectContaining({ headers: { Referer: 'https://portal.test' } }));
  });
});

describe('startQueuedDownloads', () => {
  it('does nothing when auto-start is disabled', () => {
    useSettingsStore.setState({ autoStartDownloads: false });
    useDownloadStore.setState({
      jobs: [{
        id: 'queued-1',
        sourceUrl: 'https://cdn.test/a.mp4',
        fileName: 'A.mp4',
        state: 'queued',
        progress: null,
        attempts: 0,
        maxAttempts: 3,
        downloadedBytes: 0,
        totalBytes: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    });

    startQueuedDownloads();

    expect(downloadMediaStart).not.toHaveBeenCalled();
  });

  it('starts only as many queued jobs as there are free slots', async () => {
    useSettingsStore.setState({ maxConcurrentDownloads: 2 });
    const makeJob = (id: string) => ({
      id,
      sourceUrl: `https://cdn.test/${id}.mp4`,
      fileName: `${id}.mp4`,
      state: 'queued' as const,
      progress: null,
      attempts: 0,
      maxAttempts: 3,
      downloadedBytes: 0,
      totalBytes: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    useDownloadStore.setState({ jobs: [makeJob('a'), makeJob('b'), makeJob('c')] });

    startQueuedDownloads();
    await vi.waitFor(() => expect(activeJobCount()).toBe(2));

    expect(downloadMediaStart).toHaveBeenCalledTimes(2);
    const states = useDownloadStore.getState().jobs.map((job) => job.state);
    expect(states.filter((state) => state === 'downloading')).toHaveLength(2);
    expect(states.filter((state) => state === 'queued')).toHaveLength(1);
  });
});
