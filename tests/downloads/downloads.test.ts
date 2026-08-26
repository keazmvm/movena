import { describe, expect, it } from 'vitest';
import {
  cancelDownloadJob,
  canTransitionDownloadJob,
  createCollisionSafeFileName,
  createDownloadJob,
  normalizeDownloadJob,
  normalizeDownloadProgress,
  retryDownloadJob,
  sanitizeDownloadFileName,
  transitionDownloadJob,
  updateDownloadProgress,
} from '../../src/utils/downloads';
import { migrateDownloadState } from '../../src/store/useDownloadStore';
import { useDownloadStore } from '../../src/store/useDownloadStore';

describe('download domain helpers', () => {
  it('does not let a late native event revive a terminal queue entry', () => {
    useDownloadStore.setState({ jobs: [] });
    useDownloadStore.getState().enqueue({
      id: 'job-race',
      sourceUrl: 'https://example.test/movie.mp4',
      fileName: 'movie.mp4',
    });
    useDownloadStore.getState().start('job-race');
    useDownloadStore.getState().sync({ id: 'job-race', state: 'cancelled' });
    useDownloadStore.getState().sync({ id: 'job-race', state: 'completed', downloadedBytes: 100, totalBytes: 100 });

    expect(useDownloadStore.getState().jobs[0]).toMatchObject({ state: 'cancelled', progress: null });
  });

  it('sanitizes path separators, controls, trailing dots, and reserved names', () => {
    expect(sanitizeDownloadFileName('  CON?.mp4\u0000  ')).toBe('CON_.mp4_');
    expect(sanitizeDownloadFileName('CON')).toBe('_CON');
    expect(sanitizeDownloadFileName('../AUX.')).toBe('.._AUX');
    expect(sanitizeDownloadFileName('   ')).toBe('download');
  });

  it('preserves extensions while bounding very long names', () => {
    const name = sanitizeDownloadFileName(`${'x'.repeat(220)}.mkv`, { maxLength: 30 });
    expect(name).toHaveLength(30);
    expect(name.endsWith('.mkv')).toBe(true);
  });

  it('generates case-insensitive collision-safe names without filesystem access', () => {
    expect(createCollisionSafeFileName('Movie.mp4', ['movie.mp4', 'Movie (1).mp4']))
      .toBe('Movie (2).mp4');
    expect(createCollisionSafeFileName('Episode.mkv', ['other.mkv'])).toBe('Episode.mkv');
  });

  it('normalizes malformed and oversized progress safely', () => {
    expect(normalizeDownloadProgress('bad', 100)).toEqual({
      downloadedBytes: 0,
      totalBytes: 100,
      ratio: 0,
      percent: 0,
      indeterminate: false,
    });
    expect(normalizeDownloadProgress(150.9, 100)).toEqual({
      downloadedBytes: 100,
      totalBytes: 100,
      ratio: 1,
      percent: 100,
      indeterminate: false,
    });
    expect(normalizeDownloadProgress(512, 0).indeterminate).toBe(true);
  });

  it('rejects malformed required job identity and repairs optional fields', () => {
    expect(createDownloadJob({ sourceUrl: 'https://example.test/file' })).toBeNull();

    const job = normalizeDownloadJob({
      id: ' job-1 ',
      sourceUrl: ' https://example.test/file ',
      fileName: 'bad/name.mp4',
      state: 'not-a-state',
      downloadedBytes: 12,
      totalBytes: 100,
      maxAttempts: -4,
      attempts: 99,
      createdAt: 'bad',
      updatedAt: Number.NaN,
    }, 1234);

    expect(job).toMatchObject({
      id: 'job-1',
      sourceUrl: 'https://example.test/file',
      fileName: 'bad_name.mp4',
      state: 'queued',
      progress: 0.12,
      attempts: 1,
      maxAttempts: 1,
      createdAt: 1234,
      updatedAt: 1234,
    });
  });

  it('enforces the safe state machine and does not mutate jobs', () => {
    const queued = createDownloadJob({ id: 'job-1', sourceUrl: 'https://example.test', fileName: 'video.mp4' });
    expect(queued).not.toBeNull();
    if (!queued) return;

    expect(canTransitionDownloadJob('queued', 'start')).toBe(true);
    expect(canTransitionDownloadJob('completed', 'cancel')).toBe(false);
    expect(transitionDownloadJob(queued, { type: 'complete' }, 10)).toEqual(queued);

    const downloading = transitionDownloadJob(queued, { type: 'start' }, 20);
    expect(downloading).toMatchObject({ state: 'downloading', attempts: 1, updatedAt: 20 });
    expect(queued.state).toBe('queued');
    if (!downloading) return;

    const paused = transitionDownloadJob(downloading, { type: 'pause' }, 30);
    expect(paused?.state).toBe('paused');
    expect(transitionDownloadJob(paused, { type: 'progress', downloadedBytes: 4, totalBytes: 10 }, 40))
      .toEqual(paused);
  });

  it('normalizes progress through the downloading state and completes at 100%', () => {
    const created = createDownloadJob({ id: 'job-2', sourceUrl: 'https://example.test', fileName: 'video.mp4' });
    const downloading = transitionDownloadJob(created, { type: 'start' }, 100);
    const progressing = updateDownloadProgress(downloading!, 25, 100, 110);
    expect(progressing).toMatchObject({ downloadedBytes: 25, totalBytes: 100, progress: 0.25 });

    const completed = transitionDownloadJob(progressing, { type: 'complete' }, 120);
    expect(completed).toMatchObject({ state: 'completed', downloadedBytes: 100, progress: 1, error: undefined });
  });

  it('supports bounded retry and cancellation transitions', () => {
    const created = createDownloadJob({ id: 'job-3', sourceUrl: 'https://example.test', maxAttempts: 2 });
    const downloading = transitionDownloadJob(created, { type: 'start' }, 100);
    const failed = transitionDownloadJob(downloading, { type: 'fail', error: { message: 'Server unavailable' } }, 110);
    expect(failed).toMatchObject({ state: 'failed', error: 'Server unavailable' });

    const retry = retryDownloadJob(failed!, 120);
    expect(retry).toMatchObject({ state: 'queued', progress: 0, downloadedBytes: 0, attempts: 1 });
    const secondAttempt = transitionDownloadJob(retry, { type: 'start' }, 130);
    const exhausted = transitionDownloadJob(secondAttempt, { type: 'fail', error: '' }, 140);
    expect(retryDownloadJob(exhausted!, 150)).toEqual(exhausted);

    const cancelled = cancelDownloadJob(downloading!, 'User stopped the download', 160);
    expect(cancelled).toMatchObject({ state: 'cancelled', error: 'User stopped the download' });
  });

  it('returns null for malformed transition jobs and actions without throwing', () => {
    expect(transitionDownloadJob(null, { type: 'start' })).toBeNull();
    expect(transitionDownloadJob({ id: 'x' }, null)).toBeNull();
    expect(transitionDownloadJob({ id: 'x', sourceUrl: 'url' }, { type: 'unknown' })).toMatchObject({ state: 'queued' });
  });

  it('drops persisted native jobs so media URLs and headers never survive restart', () => {
    const migrated = migrateDownloadState({ jobs: [{
      id: 'job-1', sourceUrl: 'https://example.test/movie.mp4', fileName: 'movie.mp4',
      state: 'downloading', downloadedBytes: 12, totalBytes: 100,
    }] });
    expect(migrated.jobs).toEqual([]);
  });
});
