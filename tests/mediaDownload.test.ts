// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/ipc', () => ({
  tauriApi: {
    downloadMediaStart: vi.fn(),
  },
}));

import { tauriApi } from '../src/api/ipc';
import { downloadMediaItem, startMediaDownload } from '../src/services/mediaDownload';
import { useDownloadStore } from '../src/store/useDownloadStore';

const downloadMediaMock = vi.mocked(tauriApi.downloadMediaStart);

describe('media download action', () => {
  beforeEach(() => {
    useDownloadStore.setState({ jobs: [] });
    downloadMediaMock.mockReset();
  });

  it('starts and completes a player download in the persistent queue', async () => {
    downloadMediaMock.mockResolvedValue(undefined);

    await expect(startMediaDownload({
      url: 'https://media.test/movie.mp4',
      fileName: 'Movie.mp4',
      headers: { Referer: 'https://portal.test' },
    })).resolves.toBeNull();

    expect(downloadMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      url: 'https://media.test/movie.mp4',
      fileName: 'Movie.mp4',
      headers: { Referer: 'https://portal.test' },
    }));
    expect(useDownloadStore.getState().jobs[0]).toMatchObject({ state: 'downloading', progress: null });
  });

  it('records a native failure so the Downloads page can offer a retry', async () => {
    downloadMediaMock.mockRejectedValue(new Error('Server unavailable'));

    await expect(startMediaDownload({
      url: 'https://media.test/movie.mp4',
      fileName: 'Movie.mp4',
    })).resolves.toBeNull();

    expect(useDownloadStore.getState().jobs[0]).toMatchObject({ state: 'failed', error: 'Server unavailable' });
  });

  it('does not create duplicate active jobs when the player is clicked repeatedly', async () => {
    downloadMediaMock.mockResolvedValue(undefined);
    const request = { url: 'https://media.test/movie.mp4', fileName: 'Movie.mp4' };

    await startMediaDownload(request);
    await startMediaDownload(request);

    expect(downloadMediaMock).toHaveBeenCalledTimes(1);
    expect(useDownloadStore.getState().jobs).toHaveLength(1);
  });

  it('builds a safe media filename and preserves source headers outside the player', async () => {
    downloadMediaMock.mockResolvedValue(undefined);

    await downloadMediaItem({
      title: 'Movie: Director/Final Cut',
      type: 'vod',
      streamUrl: 'https://media.test/movie.mkv',
      containerExtension: '.mkv',
      httpHeaders: { Referer: 'https://portal.test' },
    });

    expect(downloadMediaMock).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'Movie_ Director_Final Cut.mkv',
      headers: { Referer: 'https://portal.test' },
    }));
  });
});
