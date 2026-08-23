// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../src/api/useCatalog', () => {
  const query = {
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  };

  return {
    useVodStreams: vi.fn(() => query),
    useSeriesList: vi.fn(() => query),
    useLiveStreams: vi.fn(() => query),
  };
});

vi.mock('../src/hooks/useEnabledSources', () => ({
  useEnabledSources: vi.fn(() => ({ isAvailable: true })),
}));

vi.mock('../src/components/layout/PageTransition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../src/components/catalog/CatalogViewToggle', () => ({
  CatalogViewToggle: () => <div data-testid="catalog-view-toggle" />,
}));

vi.mock('../src/components/catalog/VirtualizedGrid', () => ({
  VirtualizedGrid: ({
    items,
    onItemClick,
  }: {
    items: Array<{ id: string; title: string }>;
    onItemClick?: (item: { id: string; title: string }) => void;
  }) => (
    <div data-testid="search-results">
      {items.map((item) => (
        <button key={item.id} onClick={() => onItemClick?.(item)}>{item.title}</button>
      ))}
    </div>
  ),
}));

vi.mock('../src/components/modals/MovieDetailModal', () => ({
  MovieDetailModal: ({ movieTitle }: { movieTitle: string }) => (
    <div role="dialog" aria-label={`Movie details for ${movieTitle}`} />
  ),
}));

import { Search } from '../src/pages/Search';
import { useVodStreams } from '../src/api/useCatalog';
import { useSearchStore } from '../src/store/useSearchStore';

beforeEach(() => {
  localStorage.clear();
  useSearchStore.setState({ recentSearches: ['Dune'] });
  vi.mocked(useVodStreams).mockReturnValue({
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useVodStreams>);
});

describe('search page controls', () => {
  it('keeps the catalogue view toggle out of the idle state and reveals it for an active query', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/search']}>
        <Search />
      </MemoryRouter>,
    );

    expect(screen.getByText('Recent searches')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Search Movena' })).toBeTruthy();
    expect(screen.queryByTestId('catalog-view-toggle')).toBeNull();

    await user.type(
      screen.getByRole('textbox', { name: 'Search movies, series, or live channels' }),
      'Dune',
    );

    expect(screen.getByTestId('catalog-view-toggle')).toBeTruthy();
  });

  it('restores the result type from the URL and keeps it there when changed', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=series']}>
        <Search />
      </MemoryRouter>,
    );

    expect(screen.getByRole('radio', { name: 'Series' }).getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('radio', { name: 'Movies' }));
    expect(screen.getByRole('radio', { name: 'Movies' }).getAttribute('aria-checked')).toBe('true');
  });

  it('opens movie details instead of unexpectedly starting search-result playback', async () => {
    const user = userEvent.setup();
    vi.mocked(useVodStreams).mockReturnValue({
      data: [{
        id: 'movie-1',
        title: 'Dune',
        posterUrl: '',
        type: 'vod',
        sourceId: 'source-1',
        sourceItemId: '1',
      }],
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useVodStreams>);

    render(
      <MemoryRouter initialEntries={['/search?q=Dune&type=movies']}>
        <Search />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Dune' }));
    expect(await screen.findByRole('dialog', { name: 'Movie details for Dune' })).toBeTruthy();
  });
});
