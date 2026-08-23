import { lazy, Suspense } from 'react';
import type { MediaItem } from '../catalog/MediaCard';

const MovieDetailModal = lazy(() =>
  import('./MovieDetailModal').then((module) => ({ default: module.MovieDetailModal }))
);
const SeriesDetailModal = lazy(() =>
  import('./SeriesDetailModal').then((module) => ({ default: module.SeriesDetailModal }))
);

function positiveNumber(value: string | number | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export interface MediaDetailModalsProps {
  selectedMovie?: MediaItem | null;
  selectedSeries?: MediaItem | null;
  onCloseMovie?: () => void;
  onCloseSeries?: () => void;
  onCloseAll?: () => void;
}

export function MediaDetailModals({
  selectedMovie,
  selectedSeries,
  onCloseMovie,
  onCloseSeries,
  onCloseAll,
}: MediaDetailModalsProps) {
  const closeMovie = onCloseMovie || onCloseAll || (() => {});
  const closeSeries = onCloseSeries || onCloseAll || (() => {});

  return (
    <>
      {selectedMovie && (
        <Suspense fallback={null}>
          <MovieDetailModal
            movieId={selectedMovie.id}
            movieTitle={selectedMovie.title}
            moviePoster={selectedMovie.posterUrl}
            sourceId={selectedMovie.sourceId}
            sourceItemId={selectedMovie.sourceItemId}
            onClose={closeMovie}
          />
        </Suspense>
      )}

      {selectedSeries && (
        <Suspense fallback={null}>
          <SeriesDetailModal
            seriesId={selectedSeries.id}
            seriesTitle={selectedSeries.title}
            seriesPoster={selectedSeries.posterUrl}
            sourceId={selectedSeries.sourceId}
            sourceItemId={selectedSeries.sourceItemId}
            initialSeasonNumber={positiveNumber(selectedSeries.seasonNum)}
            initialEpisodeNumber={positiveNumber(selectedSeries.episodeNum)}
            onClose={closeSeries}
          />
        </Suspense>
      )}
    </>
  );
}
