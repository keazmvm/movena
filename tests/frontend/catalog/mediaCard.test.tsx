// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { MediaCard, type MediaItem } from '@/components/catalog/MediaCard';
import { useDownloadStore } from '@/store/useDownloadStore';

const movieItem: MediaItem = { id: 'movie-1', title: 'Inception', posterUrl: '', type: 'vod' };

function renderCard(item: MediaItem, viewMode?: 'grid' | 'list') {
  return render(
    <MemoryRouter>
      <MediaCard item={item} viewMode={viewMode} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useDownloadStore.setState({ jobs: [], downloadedByLibraryId: {} });
});

describe('MediaCard downloaded indicator', () => {
  it('shows no downloaded badge for a title that has not been downloaded', () => {
    renderCard(movieItem);
    expect(screen.queryByTitle('Downloaded')).toBeNull();
  });

  it('shows a downloaded badge once the title is in the local download library', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Inception.mp4',
      fileName: 'Inception.mp4',
      type: 'vod',
      title: 'Inception',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    renderCard(movieItem);
    expect(screen.getByTitle('Downloaded')).toBeTruthy();
  });

  it('only badges the specific downloaded title, not every card', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'some-other-movie',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Other.mp4',
      fileName: 'Other.mp4',
      type: 'vod',
      title: 'Other Movie',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    renderCard(movieItem);
    expect(screen.queryByTitle('Downloaded')).toBeNull();
  });

  it('renders the downloaded indicator in list view too', () => {
    useDownloadStore.getState().addDownloadedItem({
      id: 'movie-1',
      jobId: 'job-1',
      filePath: 'C:\\Downloads\\Inception.mp4',
      fileName: 'Inception.mp4',
      type: 'vod',
      title: 'Inception',
      sizeBytes: 100,
      downloadedAt: Date.now(),
    });
    renderCard(movieItem, 'list');
    expect(screen.getByTitle('Downloaded')).toBeTruthy();
  });
});
