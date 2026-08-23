// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: () => false }));

import { M3uEditor } from '../src/components/m3u-editor/M3uEditor';
import { M3uChannelTable } from '../src/components/m3u-editor/M3uChannelTable';
import { M3uGroupManager } from '../src/components/m3u-editor/M3uGroupManager';
import { M3uStreamHealthChecker } from '../src/components/m3u-editor/M3uStreamHealthChecker';
import { M3uRawCodeEditor } from '../src/components/m3u-editor/M3uRawCodeEditor';
import { useSourceStore, type M3uSourceProfile } from '../src/store/useSourceStore';
import type { M3uEntry } from '../src/api/m3u';
import type { XmltvGuide } from '../src/api/xmltv';
import { resetM3uVersionMemoryForTests } from '../src/services/m3uVersionHistory';

const sampleProfile: M3uSourceProfile = {
  id: 'm3u-demo-1',
  kind: 'm3u',
  name: 'Demo Playlist',
  locationType: 'remote',
  locationLabel: 'demo.test',
  refreshIntervalMinutes: 360,
  lastRefreshAt: 1,
  entryCount: 3,
  liveCount: 2,
  vodCount: 1,
  seriesCount: 0,
  hasEpg: true,
};

const sampleEntries: M3uEntry[] = [
  {
    id: 'entry-1',
    sourceId: 'm3u-demo-1',
    title: '[4K] BBC One HD |UK|',
    url: 'http://stream.test/bbc1.m3u8',
    type: 'live',
    duration: -1,
    groupTitle: 'UK Live',
    categoryId: 'cat-uk-live',
    channelNumber: '101',
    tvgId: 'bbc1.uk',
    logo: 'http://logo.test/bbc1.png',
    headers: {},
    description: 'BBC flagship channel',
    catchupSource: 'https://archive.test/{utc}',
    year: '2024',
    rating: 8.2,
    extraAttributes: { 'vendor-id': 'bbc-one' },
  },
  {
    id: 'entry-2',
    sourceId: 'm3u-demo-1',
    title: 'Sky Sports Premier League',
    url: 'http://stream.test/skysports.m3u8',
    type: 'live',
    duration: -1,
    groupTitle: 'Sports',
    categoryId: 'cat-sports',
    channelNumber: '102',
    tvgId: 'skysports.uk',
    headers: {},
  },
  {
    id: 'entry-3',
    sourceId: 'm3u-demo-1',
    title: 'Inception (2010)',
    url: 'http://stream.test/inception.mp4',
    type: 'vod',
    duration: 8880,
    groupTitle: 'Movies',
    categoryId: 'cat-movies',
    headers: {},
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('indexedDB', undefined);
  resetM3uVersionMemoryForTests();
  vi.clearAllMocks();
  useSourceStore.setState({
    profiles: [sampleProfile],
    runtimes: {
      [sampleProfile.id]: {
        connection: { location: 'https://demo.test/list.m3u' },
        playlist: {
          entries: sampleEntries,
          epgUrls: ['https://epg.test/epg.xml'],
          warnings: [],
        },
        status: 'ready',
        error: null,
        revision: 1,
      },
    },
    enabledSourceIds: [sampleProfile.id],
    isInitializing: false,
    initializationError: null,
  });
});

describe('M3U Editor UI components', () => {
  it('renders stats bar, channel rows, and handles search filtering', async () => {
    render(<M3uEditor initialSourceId={sampleProfile.id} />);

    await waitFor(() => expect(screen.getByText('[4K] BBC One HD |UK|')).toBeTruthy());
    expect(screen.getByText(/All changes saved/)).toBeTruthy();
    expect(screen.getByText('Sky Sports Premier League')).toBeTruthy();

    const searchInput = screen.getByPlaceholderText('Search title, URL, EPG ID...');
    fireEvent.change(searchInput, { target: { value: 'Inception' } });

    expect(screen.getByText('Inception (2010)')).toBeTruthy();
    expect(screen.queryByText('Sky Sports Premier League')).toBeNull();
  });

  it('allows editing a single channel via the inspector drawer', () => {
    const onUpdateEntries = vi.fn();
    render(
      <M3uChannelTable
        entries={sampleEntries}
        healthStatuses={{}}
        onUpdateEntries={onUpdateEntries}
      />
    );

    const editButtons = screen.getAllByLabelText(/Edit channel/);
    fireEvent.click(editButtons[0]);

    expect(screen.getByRole('dialog', { name: 'Edit Channel' })).toBeTruthy();
    const titleInput = screen.getByLabelText('Channel Name');
    fireEvent.change(titleInput, { target: { value: 'BBC One FHD' } });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'entry-1', title: 'BBC One FHD', description: 'BBC flagship channel',
          catchupSource: 'https://archive.test/{utc}', year: '2024', rating: 8.2,
          extraAttributes: { 'vendor-id': 'bbc-one' },
        }),
      ])
    );
  });

  it('supports undo after editing a channel', async () => {
    render(<M3uEditor initialSourceId={sampleProfile.id} />);
    await waitFor(() => expect(screen.getAllByLabelText(/Edit channel/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByLabelText(/Edit channel/)[0]);
    fireEvent.change(screen.getByLabelText('Channel Name'), { target: { value: 'BBC One Edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('BBC One Edited')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('[4K] BBC One HD |UK|')).toBeTruthy();
  });

  it('migrates and restores a source-scoped legacy autosaved draft', async () => {
    localStorage.setItem(`movena-m3u-editor-draft-v1:${sampleProfile.id}`, JSON.stringify({
      content: '#EXTM3U\n#EXTINF:-1 group-title="Drafts",Recovered Channel\nhttps://stream.test/recovered.m3u8',
      savedAt: Date.now(),
    }));
    render(<M3uEditor initialSourceId={sampleProfile.id} />);
    await waitFor(() => expect(screen.getByText('Recovered Channel')).toBeTruthy());
    expect(screen.getByText(/Unsaved draft/)).toBeTruthy();
  });

  it('runs batch title cleanup and updates entries', () => {
    const onUpdateEntries = vi.fn();
    render(
      <M3uChannelTable
        entries={sampleEntries}
        healthStatuses={{}}
        onUpdateEntries={onUpdateEntries}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Batch Tools' }));
    expect(screen.getByRole('dialog', { name: 'Batch Tools' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Apply Clean/ }));
    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'entry-1' }),
      ])
    );
  });

  it('supports keyboard-first row navigation and selection', () => {
    render(<M3uChannelTable entries={sampleEntries} healthStatuses={{}} onUpdateEntries={vi.fn()} />);
    const grid = screen.getByRole('grid', { name: /Channels\. Use arrow keys/ });
    grid.focus();
    fireEvent.keyDown(grid, { key: ' ' });
    expect((screen.getByLabelText(`Select channel ${sampleEntries[0].title}`) as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Edit Channel' })).toBeTruthy();
    expect(screen.getByLabelText('Channel Name')).toHaveProperty('value', sampleEntries[1].title);
  });

  it('opens the editor command palette with Ctrl+K', () => {
    render(<M3uEditor initialSourceId={sampleProfile.id} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog', { name: 'Editor Command Palette' })).toBeTruthy();
    expect(screen.getByRole('option', { name: /Show Diagnostics/ })).toBeTruthy();
  });

  it('renames and merges groups in the Category Manager', () => {
    const onUpdateEntries = vi.fn();
    render(
      <M3uGroupManager
        entries={sampleEntries}
        onUpdateEntries={onUpdateEntries}
      />
    );

    expect(screen.getByText('UK Live')).toBeTruthy();
    expect(screen.getByText('Sports')).toBeTruthy();

    const renameButtons = screen.getAllByLabelText('Rename category');
    fireEvent.click(renameButtons[0]);

    const input = screen.getByDisplayValue('Movies');
    fireEvent.change(input, { target: { value: 'Cinema' } });
    fireEvent.click(screen.getByLabelText('Save rename'));

    expect(onUpdateEntries).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ groupTitle: 'Cinema' }),
      ])
    );
  });

  it('detects duplicate streams and reports counts', () => {
    const duplicates: M3uEntry[] = [
      ...sampleEntries,
      {
        id: 'entry-dup',
        sourceId: 'm3u-demo-1',
        title: 'BBC One Backup',
        url: 'http://stream.test/bbc1.m3u8', // identical URL
        type: 'live',
        duration: -1,
        groupTitle: 'UK Live',
        categoryId: 'cat-uk-live',
        headers: {},
      },
    ];

    render(
      <M3uStreamHealthChecker
        entries={duplicates}
        healthStatuses={{}}
        onUpdateHealthStatuses={vi.fn()}
        onUpdateEntries={vi.fn()}
      />
    );

    expect(screen.getByText(/1 exact URL duplicates can be removed safely/)).toBeTruthy();
  });

  it('validates playlist entries and applies EPG suggestions', () => {
    const guide: XmltvGuide = {
      byChannel: new Map([['m3u-demo-1::bbc.one', []]]),
      idByName: new Map([['m3u-demo-1::bbc one', 'm3u-demo-1::bbc.one']]),
      nameById: new Map([['m3u-demo-1::bbc.one', 'BBC One']]),
      channelCount: 1,
      programmeCount: 0,
    };
    const entries = [sampleEntries[0], { ...sampleEntries[1], title: 'BBC One [HD]', tvgId: undefined, url: 'invalid' }];
    const onUpdateEntries = vi.fn();
    render(<M3uStreamHealthChecker entries={entries} healthStatuses={{}} onUpdateHealthStatuses={vi.fn()} onUpdateEntries={onUpdateEntries} guide={guide} sourceId="m3u-demo-1" />);
    expect(screen.getByText('Playlist Validation')).toBeTruthy();
    expect(screen.getByText('EPG Matching Assistant')).toBeTruthy();
    expect(screen.getByText('Stream URL uses an invalid or unsupported scheme.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply High Confidence' }));
    expect(onUpdateEntries).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'entry-2', tvgId: 'bbc.one' })]));
  });

  it('runs the stream checker and records timed results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200 }));
    const onUpdateHealthStatuses = vi.fn();
    render(
      <M3uStreamHealthChecker
        entries={[sampleEntries[0]]}
        healthStatuses={{}}
        onUpdateHealthStatuses={onUpdateHealthStatuses}
        onUpdateEntries={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start Check' }));
    await waitFor(() => expect(onUpdateHealthStatuses).toHaveBeenLastCalledWith({
      'entry-1': expect.objectContaining({ status: 'online', checkedAt: expect.any(Number) }),
    }));
    vi.unstubAllGlobals();
  });

  it('clears in-progress statuses when a stream check is stopped', async () => {
    let resolveFetch!: (value: { status: number }) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<{ status: number }>((resolve) => { resolveFetch = resolve; })));
    const updates = vi.fn();

    function Harness() {
      const [statuses, setStatuses] = useState({});
      return (
        <M3uStreamHealthChecker
          entries={[sampleEntries[0]]}
          healthStatuses={statuses}
          onUpdateHealthStatuses={(next) => { setStatuses(next); updates(next); }}
          onUpdateEntries={vi.fn()}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Check' }));
    await waitFor(() => expect(updates).toHaveBeenCalledWith({ 'entry-1': 'checking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(updates).toHaveBeenLastCalledWith({});
    expect(screen.getByRole('button', { name: 'Start Check' })).toBeTruthy();
    resolveFetch({ status: 200 });
    vi.unstubAllGlobals();
  });

  it('drops diagnostic statuses for entries that no longer exist', async () => {
    const onUpdateHealthStatuses = vi.fn();
    render(
      <M3uStreamHealthChecker
        entries={[sampleEntries[0]]}
        healthStatuses={{ removed: { status: 'offline', latencyMs: 20, checkedAt: 1 } }}
        onUpdateHealthStatuses={onUpdateHealthStatuses}
        onUpdateEntries={vi.fn()}
      />
    );
    await waitFor(() => expect(onUpdateHealthStatuses).toHaveBeenCalledWith({}));
    expect(screen.queryByRole('button', { name: /Delete Offline/ })).toBeNull();
  });

  it('edits raw M3U code and syncs with visual state', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <M3uRawCodeEditor
        rawContent="#EXTM3U\n#EXTINF:-1,Sample Channel\nhttp://test.com/stream\n"
        onApplyRawText={onApply}
        onSyncFromVisual={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText('Raw M3U Code');
    await user.clear(textarea);
    await user.type(textarea, '#EXTM3U\n#EXTINF:-1,Modified Channel\nhttp://test.com/mod\n');

    const applyButton = screen.getByRole('button', { name: 'Apply Changes' });
    await user.click(applyButton);

    expect(onApply).toHaveBeenCalled();
  });

  it('supports keyboard find and replace in raw M3U code', async () => {
    const user = userEvent.setup();
    render(
      <M3uRawCodeEditor
        rawContent="#EXTM3U\n#EXTINF:-1,Sample Channel\nhttp://test.com/stream\n"
        onApplyRawText={vi.fn()}
      />
    );

    const textarea = screen.getByLabelText('Raw M3U Code');
    await user.click(textarea);
    await user.keyboard('{Control>}h{/Control}');
    expect(screen.getByRole('search', { name: 'Find and replace' })).toBeTruthy();

    const findInput = screen.getByLabelText('Find');
    const replaceInput = screen.getByLabelText('Replace');
    await user.type(findInput, 'Sample');
    await user.type(replaceInput, 'Updated');
    await user.click(screen.getByRole('button', { name: 'Replace All' }));

    expect((textarea as HTMLTextAreaElement).value).toContain('Updated Channel');
  });
});
