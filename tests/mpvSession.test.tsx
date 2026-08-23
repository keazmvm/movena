// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  mpvCommand: vi.fn(),
  mpvStart: vi.fn(),
  mpvStop: vi.fn(),
}));
const events = vi.hoisted(() => ({ listen: vi.fn() }));
const debug = vi.hoisted(() => ({
  debugLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const notifications = vi.hoisted(() => ({
  notify: { warning: vi.fn(), info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: events.listen }));
vi.mock('../src/api/ipc', () => ({ tauriApi: native }));
vi.mock('../src/components/player/aspect', () => ({ applyAspectRatio: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/components/player/imageSettings', () => ({ applyImageAdjustments: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/components/player/fullscreen', () => ({ setPlayerFullscreen: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/store/useDebugStore', () => debug);
vi.mock('../src/store/useNotificationStore', () => notifications);

import { useMpvSession } from '../src/components/player/useMpvSession';
import { usePlayerStore } from '../src/store/usePlayerStore';
import { useSettingsStore } from '../src/store/useSettingsStore';

let eventHandler: ((event: { payload: unknown }) => void) | null = null;
const unlisten = vi.fn();

const stream = {
  id: 'movie-1',
  title: 'Movie',
  type: 'vod' as const,
  streamUrl: 'https://primary.test/movie.mp4',
  startPosition: 42,
  fallbacks: [{ streamUrl: 'https://backup.test/movie.mp4' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  native.mpvStart.mockResolvedValue(undefined);
  native.mpvStop.mockResolvedValue(undefined);
  native.mpvCommand.mockResolvedValue(undefined);
  events.listen.mockImplementation(async (_name: string, handler: (event: { payload: unknown }) => void) => {
    eventHandler = handler;
    return unlisten;
  });
  eventHandler = null;
  usePlayerStore.getState().closePlayer();
  useSettingsStore.getState().resetSettings();
});

describe('native MPV session lifecycle', () => {
  it('starts only after the event listener is installed and passes the session settings', async () => {
    act(() => usePlayerStore.getState().playStream(stream));
    const { unmount } = renderHook(() => useMpvSession());

    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));
    expect(eventHandler).not.toBeNull();
    expect(native.mpvStart).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: usePlayerStore.getState().sessionId,
      url: stream.streamUrl,
      startPosition: 42,
      hwdec: 'auto-safe',
      cacheSecs: 30,
    }));

    act(() => eventHandler?.({ payload: { type: 'property-change', name: 'vo-configured', data: true, sessionId: 'stale' } }));
    expect(usePlayerStore.getState().isVideoReady).toBe(false);
    act(() => eventHandler?.({ payload: { type: 'property-change', name: 'vo-configured', data: true, sessionId: usePlayerStore.getState().sessionId } }));
    expect(usePlayerStore.getState().isVideoReady).toBe(true);

    unmount();
    await waitFor(() => expect(native.mpvStop).toHaveBeenCalledTimes(1));
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('switches to the next fallback after a confirmed end-file error', async () => {
    native.mpvStart
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    act(() => usePlayerStore.getState().playStream(stream));
    const { unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() => eventHandler?.({
      payload: {
        type: 'end-file',
        data: { reason: 'error', errorCode: -1 },
        sessionId: usePlayerStore.getState().sessionId,
      },
    }));
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(2));
    expect(native.mpvStart.mock.calls[1][0]).toMatchObject({ url: 'https://backup.test/movie.mp4', startPosition: 42 });
    expect(notifications.notify.warning).toHaveBeenCalledWith(
      'Trying Alternate Source',
      expect.any(String),
      undefined,
      undefined,
      'playback',
    );

    unmount();
  });

  it('uses a newly reduced failover budget instead of a stale settings closure', async () => {
    useSettingsStore.getState().updateSetting('maxStreamFailovers', 0);
    act(() => usePlayerStore.getState().playStream(stream));
    const { unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() => useSettingsStore.getState().updateSetting('maxStreamFailovers', 1));
    act(() => eventHandler?.({
      payload: { type: 'end-file', data: { reason: 'error' }, sessionId: usePlayerStore.getState().sessionId },
    }));
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(2));

    unmount();
  });

  it('exposes the exact mpv error when no fallback remains', async () => {
    act(() => usePlayerStore.getState().playStream({ ...stream, fallbacks: [] }));
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() => eventHandler?.({
      payload: {
        type: 'end-file',
        data: { reason: 'error', errorCode: -5, errorMessage: 'HTTP 403 Forbidden' },
        sessionId: usePlayerStore.getState().sessionId,
      },
    }));

    expect(result.current.errorMessage).toBe('mpv error -5: HTTP 403 Forbidden');
    unmount();
  });

  it('retains every technical failure when the primary and fallback both fail', async () => {
    act(() => usePlayerStore.getState().playStream(stream));
    const { result, unmount } = renderHook(() => useMpvSession());
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(1));

    act(() => eventHandler?.({
      payload: {
        type: 'end-file',
        data: { reason: 'error', errorCode: -5, errorMessage: 'Primary returned HTTP 503' },
        sessionId: usePlayerStore.getState().sessionId,
      },
    }));
    await waitFor(() => expect(native.mpvStart).toHaveBeenCalledTimes(2));

    act(() => eventHandler?.({
      payload: {
        type: 'end-file',
        data: { reason: 'error', errorCode: -6, errorMessage: 'Fallback returned HTTP 404' },
        sessionId: usePlayerStore.getState().sessionId,
      },
    }));

    expect(result.current.errorMessage).toBe(
      'mpv error -5: Primary returned HTTP 503\nmpv error -6: Fallback returned HTTP 404',
    );
    unmount();
  });
});
