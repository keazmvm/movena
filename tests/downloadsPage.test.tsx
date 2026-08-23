// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { Downloads } from '../src/pages/Downloads';
import { useDownloadStore } from '../src/store/useDownloadStore';

describe('Downloads page', () => {
  beforeEach(() => {
    useDownloadStore.setState({ jobs: [] });
  });

  it('explains where player downloads appear when the queue is empty', () => {
    render(<MemoryRouter><Downloads /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Downloads' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No Downloads Yet' })).toBeTruthy();
  });

  it('renders a completed download and removes it from the page', async () => {
    const now = Date.now();
    useDownloadStore.setState({
      jobs: [{
        id: 'job-1',
        sourceUrl: 'https://media.test/movie.mp4',
        fileName: 'Movie.mp4',
        state: 'completed',
        progress: 1,
        downloadedBytes: 1024,
        totalBytes: 1024,
        attempts: 1,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now,
      }],
    });

    const user = userEvent.setup();
    render(<MemoryRouter><Downloads /></MemoryRouter>);

    expect(screen.getByText('Movie.mp4')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove Movie.mp4' }));
    expect(screen.queryByText('Movie.mp4')).toBeNull();
    expect(useDownloadStore.getState().jobs).toHaveLength(0);
  });

  it('shows controls for an active download instead of leaving the row actionless', () => {
    useDownloadStore.setState({
      jobs: [{
        id: 'job-active',
        sourceUrl: 'https://media.test/movie.mp4',
        fileName: 'Movie.mp4',
        state: 'downloading',
        progress: null,
        downloadedBytes: 0,
        totalBytes: null,
        attempts: 1,
        maxAttempts: 3,
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    render(<MemoryRouter><Downloads /></MemoryRouter>);

    expect(screen.getByRole('button', { name: 'Pause Movie.mp4' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel Movie.mp4' })).toBeTruthy();
  });
});
