import { beforeEach, describe, expect, it } from 'vitest';
import {
  formatVerifiedResolution,
  normalizeVerifiedStreams,
  useStreamVerificationStore,
} from '../../src/store/useStreamVerificationStore';

describe('stream verification store', () => {
  beforeEach(() => {
    useStreamVerificationStore.getState().clearVerifications();
  });

  it('records stream verification and retrieves metadata', () => {
    useStreamVerificationStore.getState().recordVerification('stream-123', {
      width: 3840,
      height: 2160,
      fps: 59.94,
      isHdr: true,
      audioCodec: 'aac',
      audioChannels: 6,
    });

    const verified = useStreamVerificationStore.getState().getVerification('stream-123');
    expect(verified).not.toBeNull();
    expect(verified?.width).toBe(3840);
    expect(verified?.height).toBe(2160);
    expect(verified?.isHdr).toBe(true);
    expect(verified?.audioChannels).toBe(6);
    expect(verified?.verifiedAt).toBeGreaterThan(0);
  });

  it('formats verified resolution labels correctly', () => {
    expect(formatVerifiedResolution(3840, 2160, 60)).toBe('4K60fps');
    expect(formatVerifiedResolution(1920, 1080, 50)).toBe('1080p50fps');
    expect(formatVerifiedResolution(1920, 1080, 23.976)).toBe('1080p');
    expect(formatVerifiedResolution(1280, 720)).toBe('720p');
    expect(formatVerifiedResolution(854, 480)).toBe('480p');
  });

  it('rejects malformed/stale hydration and caps persisted verification records', () => {
    const now = 10_000_000_000;
    const values: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 520 }, (_, index) => [
        `stream-${index}`,
        {
          width: 1920,
          height: 1080,
          verifiedAt: now - index,
        },
      ]),
    );
    values.bad = { width: 0, height: 0, verifiedAt: now };
    values.stale = { width: 1920, height: 1080, verifiedAt: 0 };

    const normalized = normalizeVerifiedStreams(values, now);
    expect(Object.keys(normalized)).toHaveLength(500);
    expect(normalized.bad).toBeUndefined();
    expect(normalized.stale).toBeUndefined();
    expect(normalized['stream-0']).toBeDefined();
    expect(normalized['stream-519']).toBeUndefined();
  });
});
