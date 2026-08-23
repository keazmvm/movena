import { useCallback } from 'react';
import { MonitorPlay } from 'lucide-react';
import type { MediaItem } from '../components/catalog/MediaCard';
import { CatalogPage } from '../components/catalog/CatalogPage';
import { MediaDetailModals } from '../components/modals/MediaDetailModals';
import { useMediaDetailState } from '../hooks/useMediaDetailState';

export function Series() {
  const {
    selectedSeries,
    setSelectedSeries,
    handleCloseSeries,
  } = useMediaDetailState();

  const handleItemClick = useCallback((item: MediaItem) => {
    setSelectedSeries(item);
  }, [setSelectedSeries]);

  return (
    <>
      <CatalogPage
        type="series"
        title="Series"
        icon={MonitorPlay}
        emptyTitle="No Series Found"
        emptyDescription="There are no TV series available in this category."
        noSourceDescription="Connect an Xtream account or add an M3U playlist in Settings to view TV series."
        onItemClick={handleItemClick}
      />

      <MediaDetailModals
        selectedSeries={selectedSeries}
        onCloseSeries={handleCloseSeries}
      />
    </>
  );
}
