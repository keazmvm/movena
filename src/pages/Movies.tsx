import { useCallback } from 'react';
import { Film } from 'lucide-react';
import type { MediaItem } from '../components/catalog/MediaCard';
import { CatalogPage } from '../components/catalog/CatalogPage';
import { MediaDetailModals } from '../components/modals/MediaDetailModals';
import { useMediaDetailState } from '../hooks/useMediaDetailState';

export function Movies() {
  const { selectedMovie, setSelectedMovie, handleCloseMovie } = useMediaDetailState();

  const handleItemClick = useCallback(
    (item: MediaItem) => {
      setSelectedMovie(item);
    },
    [setSelectedMovie],
  );

  return (
    <>
      <CatalogPage
        type="vod"
        title="Movies"
        icon={Film}
        emptyTitle="No Movies Found"
        emptyDescription="There are no movie titles available in this category."
        noSourceDescription="Connect an Xtream account or add an M3U playlist in Settings to view movies."
        onItemClick={handleItemClick}
      />

      <MediaDetailModals selectedMovie={selectedMovie} onCloseMovie={handleCloseMovie} />
    </>
  );
}
