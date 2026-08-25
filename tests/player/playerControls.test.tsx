import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageControls } from '../../src/components/player/ImageControls';
import { LiveControls } from '../../src/components/player/LiveControls';
import { VolumeControl } from '../../src/components/player/SharedControls';
import { VodControls } from '../../src/components/player/VodControls';
import { usePlayerStore } from '../../src/store/usePlayerStore';
import { useSettingsStore } from '../../src/store/useSettingsStore';

const native = vi.hoisted(() => ({
  mpvPlayPause: vi.fn().mockResolvedValue(undefined),
  mpvSeek: vi.fn().mockResolvedValue(undefined),
  mpvSeekRelative: vi.fn().mockResolvedValue(undefined),
  mpvSetSpeed: vi.fn().mockResolvedValue(undefined),
  mpvSetVolume: vi.fn().mockResolvedValue(undefined),
  mpvSetRecording: vi.fn().mockResolvedValue(undefined),
}));
const imageSettings = vi.hoisted(() => ({
  applyImageAdjustment: vi.fn().mockResolvedValue(undefined),
  applyImageAdjustments: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/api/ipc', () => ({ tauriApi: native }));
vi.mock('../../src/api/xmltv', () => ({
  lookupXmltvChannel: vi.fn(() => undefined),
  useXmltvGuide: vi.fn(() => ({ data: undefined })),
}));
vi.mock('../../src/api/useDetails', () => ({ useSeriesInfo: vi.fn(() => ({ data: undefined })) }));
vi.mock('../../src/components/player/imageSettings', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/components/player/imageSettings')>(),
  ...imageSettings,
}));
vi.mock('../../src/services/mediaDownload', () => ({
  startMediaDownload: vi.fn().mockResolvedValue(null),
}));

function withQueryClient(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}

beforeEach(() => {
  for (const mock of Object.values(native)) mock.mockClear();
  for (const mock of Object.values(imageSettings)) mock.mockClear();
  usePlayerStore.setState({
    activeStream: null,
    isPlaying: false,
    currentTime: 20,
    duration: 100,
    volume: 40,
    isMuted: false,
    playbackSpeed: 1,
    isRecording: false,
    activePopover: null,
    showChannelsDrawer: false,
    showEpisodesDrawer: false,
  });
  useSettingsStore.setState({
    seekJumpSecs: 10,
    lastAudibleVolume: 65,
    instantRecord: false,
    imageSharpness: 0,
    imageBrightness: 100,
    imageContrast: 0,
    imageSaturation: 0,
    imageHue: 0,
    imageGamma: 0,
  });
});

describe('player control variants', () => {
  it('drives native volume commands from the shared controls', async () => {
    render(<VolumeControl />);
    await userEvent.click(screen.getByRole('button', { name: 'Mute / Unmute (M)' }));
    expect(native.mpvSetVolume).toHaveBeenCalledWith(0);

    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '72' } });
    expect(native.mpvSetVolume).toHaveBeenCalledWith(72);
  });

  it('opens and resets modified image controls', async () => {
    useSettingsStore.setState({ imageBrightness: 125 });
    render(<ImageControls />);
    await userEvent.click(screen.getByRole('button', { name: 'Image Adjustments' }));
    expect(screen.getByText('Image')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reset image adjustments' }));
    expect(imageSettings.applyImageAdjustments).toHaveBeenCalledOnce();
  });

  it('renders live controls and toggles playback and the channel drawer', async () => {
    usePlayerStore.setState({
      activeStream: { id: 'live-1', title: 'News', type: 'live', streamUrl: 'https://media.test/live.m3u8' },
    });
    withQueryClient(<LiveControls />);

    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(native.mpvPlayPause).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Channels List' }));
    expect(usePlayerStore.getState().showChannelsDrawer).toBe(true);
  });

  it('renders VOD controls and maps seek/speed interactions to native commands', async () => {
    usePlayerStore.setState({
      activeStream: { id: 'vod-1', title: 'Film', type: 'vod', streamUrl: 'https://media.test/film.mp4' },
    });
    withQueryClient(<VodControls />);

    await userEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds' }));
    expect(native.mpvSeekRelative).toHaveBeenCalledWith(10);
    await userEvent.click(screen.getByRole('button', { name: 'Playback Speed' }));
    await userEvent.click(screen.getByRole('button', { name: '1.25×' }));
    expect(native.mpvSetSpeed).toHaveBeenCalledWith(1.25);
  });
});
