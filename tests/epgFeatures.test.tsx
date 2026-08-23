// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/api/useCatalog', async () => {
  const actual = await vi.importActual<typeof import('../src/api/useCatalog')>('../src/api/useCatalog');
  return { ...actual, useLiveStreams: vi.fn() };
});

vi.mock('../src/api/xmltv', async () => {
  return {
    useXmltvGuide: vi.fn().mockReturnValue({ data: null, isLoading: false }),
    lookupXmltvChannel: vi.fn(),
  };
});

const useChannelEpg = vi.hoisted(() => {
  const result = {
    data: [{
      id: 'cached-programme',
      title: 'Cached News',
      description: '',
      start: Date.now() - 30 * 60_000,
      end: Date.now() + 30 * 60_000,
    }],
    isLoading: false,
    isError: false,
    isSuccess: true,
    canFetch: true,
  };
  return vi.fn(() => result);
});

vi.mock('../src/api/useEpg', () => ({ useChannelEpg }));

vi.mock('../src/api/useCategories', async () => {
  const actual = await vi.importActual<typeof import('../src/api/useCategories')>('../src/api/useCategories');
  return { ...actual, useCategories: vi.fn(), useHiddenCategoryIds: vi.fn() };
});

vi.mock('../src/hooks/useEnabledSources', () => {
  return {
    useEnabledSources: vi.fn().mockReturnValue({ isAvailable: true }),
  };
});

import { Epg, epgNowScrollLeft } from '../src/pages/Epg';
import { useLiveStreams } from '../src/api/useCatalog';
import { useCategories, useHiddenCategoryIds } from '../src/api/useCategories';

const channels = [
  { id: 'ch-1', title: 'BBC One', posterUrl: '', type: 'live' as const, channelNum: 1, streamUrl: 'http://x/1', categoryId: 'de-news' },
  { id: 'ch-2', title: 'CNN International', posterUrl: '', type: 'live' as const, channelNum: 2, streamUrl: 'http://x/2', categoryId: 'us-news' },
];

const categories = [
  { category_id: 'de-news', category_name: 'DE| News', parent_id: 0 },
  { category_id: 'us-news', category_name: 'US| News', parent_id: 0 },
];

function renderEpg() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <Epg />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
  vi.mocked(useLiveStreams).mockReturnValue({ data: channels } as unknown as ReturnType<typeof useLiveStreams>);
  vi.mocked(useCategories).mockReturnValue({ data: categories } as unknown as ReturnType<typeof useCategories>);
  vi.mocked(useHiddenCategoryIds).mockReturnValue(new Set());
});

describe('EPG TV Guide Features', () => {
  it('positions now at the configured inset instead of leaving the timeline at zero', () => {
    const windowStart = Date.UTC(2026, 7, 23, 1, 0, 0);
    const now = Date.UTC(2026, 7, 23, 3, 20, 0);

    expect(epgNowScrollLeft(now, windowStart, 4.5, 160)).toBe(470);
    expect(epgNowScrollLeft(windowStart, windowStart, 4.5, 160)).toBe(0);
  });

  it('re-applies the now position after the guide canvas mounts', async () => {
    renderEpg();

    const guide = screen.getByRole('region', { name: 'TV Guide' });
    await waitFor(() => expect(guide.scrollLeft).toBeGreaterThan(0));
  });

  it('renders cached row listings immediately without the old remount delay', () => {
    renderEpg();

    expect(screen.getAllByText('Cached News').length).toBeGreaterThan(0);
  });

  it('allows searching channels to filter the grid display', async () => {
    renderEpg();
    const user = userEvent.setup();

    // Verify search input renders
    const searchInput = screen.getByRole('textbox', { name: 'Filter channels' });
    expect(searchInput).toBeTruthy();

    // BBC One should be there
    expect(screen.getByText('BBC One')).toBeTruthy();

    // Search for CNN
    await user.type(searchInput, 'CNN');
    
    // BBC One should no longer match
    expect(screen.queryByText('BBC One')).toBeNull();
    expect(screen.getByText('CNN International')).toBeTruthy();
  });

  it('loads every channel belonging to a selected country', async () => {
    renderEpg();
    const user = userEvent.setup();

    const germany = screen.getByRole('button', { name: /^Germany,/ });
    await user.click(germany);

    expect(germany.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('BBC One')).toBeTruthy();
    expect(screen.queryByText('CNN International')).toBeNull();
  });
});
