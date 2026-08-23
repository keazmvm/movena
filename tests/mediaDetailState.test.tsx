import { render, screen, renderHook, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaDetailState } from '../src/hooks/useMediaDetailState';
import { MediaDetailModals } from '../src/components/modals/MediaDetailModals';
import { usePlayerStore } from '../src/store/usePlayerStore';
import { useSourceStore } from '../src/store/useSourceStore';
import { useAuthStore } from '../src/store/useAuthStore';
import type { MediaItem } from '../src/components/catalog/MediaCard';

// Mock detail modals to keep tests lightweight and fast
vi.mock('../src/components/modals/MovieDetailModal', () => ({
  MovieDetailModal: ({ movieTitle, onClose }: { movieTitle: string; onClose: () => void }) => (
    <div data-testid="mock-movie-modal">
      <span>{movieTitle}</span>
      <button onClick={onClose}>Close Movie</button>
    </div>
  ),
}));

vi.mock('../src/components/modals/SeriesDetailModal', () => ({
  SeriesDetailModal: ({ seriesTitle, initialSeasonNumber, initialEpisodeNumber, onClose }: { seriesTitle: string; initialSeasonNumber?: number; initialEpisodeNumber?: number; onClose: () => void }) => (
    <div data-testid="mock-series-modal">
      <span>{seriesTitle}</span>
      <span data-testid="mock-series-context">{`${initialSeasonNumber ?? ''}:${initialEpisodeNumber ?? ''}`}</span>
      <button onClick={onClose}>Close Series</button>
    </div>
  ),
}));

describe('useMediaDetailState hook', () => {
  beforeEach(() => {
    usePlayerStore.setState({ activeStream: null });
    useAuthStore.setState({ credentials: null, profiles: [] });
    useSourceStore.setState({ profiles: [], enabledSourceIds: [], runtimes: {} });
  });

  it('routes movies to selectedMovie and closes cleanly', () => {
    const { result } = renderHook(() => useMediaDetailState());
    const movieItem: MediaItem = { id: 'm1', title: 'Inception', posterUrl: '', type: 'vod' };

    act(() => {
      result.current.handleItemClick(movieItem);
    });

    expect(result.current.selectedMovie).toEqual(movieItem);
    expect(result.current.selectedSeries).toBeNull();

    act(() => {
      result.current.handleCloseMovie();
    });

    expect(result.current.selectedMovie).toBeNull();
  });

  it('routes series to selectedSeries and closes cleanly', () => {
    const { result } = renderHook(() => useMediaDetailState());
    const seriesItem: MediaItem = { id: 's1', title: 'Breaking Bad', posterUrl: '', type: 'series' };

    act(() => {
      result.current.handleItemClick(seriesItem);
    });

    expect(result.current.selectedSeries).toEqual(seriesItem);
    expect(result.current.selectedMovie).toBeNull();

    act(() => {
      result.current.handleCloseSeries();
    });

    expect(result.current.selectedSeries).toBeNull();
  });

  it('preserves episode context and keeps detail selections mutually exclusive', () => {
    const { result } = renderHook(() => useMediaDetailState());
    const movieItem: MediaItem = { id: 'm1', title: 'Movie', posterUrl: '', type: 'vod' };
    const seriesItem: MediaItem = { id: 's1', title: 'Series', posterUrl: '', type: 'series' };

    act(() => result.current.handleItemClick(movieItem));
    act(() => result.current.handleItemClick(seriesItem, { seasonNumber: 3, episodeNumber: 7 }));

    expect(result.current.selectedMovie).toBeNull();
    expect(result.current.selectedSeries).toMatchObject({ seasonNum: 3, episodeNum: 7 });

    act(() => result.current.handleItemClick(movieItem));
    expect(result.current.selectedSeries).toBeNull();
    expect(result.current.selectedMovie).toEqual(movieItem);
  });

  it('plays live streams directly through player store', () => {
    const { result } = renderHook(() => useMediaDetailState());
    const liveItem: MediaItem = {
      id: 'l1',
      title: 'Sky Sports',
      posterUrl: '',
      type: 'live',
      streamUrl: 'https://stream.test/live.m3u8',
    };

    act(() => {
      result.current.handleItemClick(liveItem);
    });

    expect(result.current.selectedMovie).toBeNull();
    expect(result.current.selectedSeries).toBeNull();
    expect(usePlayerStore.getState().activeStream).toMatchObject({
      id: 'l1',
      title: 'Sky Sports',
      type: 'live',
    });
  });

  it('enables source when enableSourceOnOpen is true', () => {
    useSourceStore.setState({
      profiles: [
        {
          id: 'src-1',
          name: 'Provider 1',
          kind: 'm3u',
          locationType: 'remote',
          locationLabel: 'https://example.com',
          refreshIntervalMinutes: 1440,
          lastRefreshAt: Date.now(),
          entryCount: 10,
          liveCount: 5,
          vodCount: 5,
          seriesCount: 0,
          hasEpg: false,
        },
      ],
      enabledSourceIds: [],
    });

    const { result } = renderHook(() => useMediaDetailState({ enableSourceOnOpen: true }));
    const itemWithSource: MediaItem = {
      id: 'm1',
      title: 'Movie',
      posterUrl: '',
      type: 'vod',
      sourceId: 'src-1',
    };

    act(() => {
      result.current.handleItemClick(itemWithSource);
    });

    expect(useSourceStore.getState().enabledSourceIds.includes('src-1')).toBe(true);
  });
});

describe('MediaDetailModals component', () => {
  it('renders movie modal when selectedMovie is provided and handles close', async () => {
    const user = userEvent.setup();
    const handleCloseMovie = vi.fn();
    const movieItem: MediaItem = { id: 'm1', title: 'Interstellar', posterUrl: '', type: 'vod' };

    render(
      <MediaDetailModals
        selectedMovie={movieItem}
        onCloseMovie={handleCloseMovie}
      />
    );

    expect(await screen.findByTestId('mock-movie-modal')).toBeTruthy();
    expect(screen.getByText('Interstellar')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Close Movie' }));
    expect(handleCloseMovie).toHaveBeenCalledTimes(1);
  });

  it('renders series modal when selectedSeries is provided and handles close', async () => {
    const user = userEvent.setup();
    const handleCloseSeries = vi.fn();
    const seriesItem: MediaItem = { id: 's1', title: 'Severance', posterUrl: '', type: 'series' };

    render(
      <MediaDetailModals
        selectedSeries={seriesItem}
        onCloseSeries={handleCloseSeries}
      />
    );

    expect(await screen.findByTestId('mock-series-modal')).toBeTruthy();
    expect(screen.getByText('Severance')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Close Series' }));
    expect(handleCloseSeries).toHaveBeenCalledTimes(1);
  });

  it('forwards stored season and episode context into the series details', async () => {
    const seriesItem: MediaItem = {
      id: 's1',
      title: 'Severance',
      posterUrl: '',
      type: 'series',
      seasonNum: '2',
      episodeNum: 5,
    };

    render(<MediaDetailModals selectedSeries={seriesItem} />);

    expect((await screen.findByTestId('mock-series-context')).textContent).toBe('2:5');
  });
});
