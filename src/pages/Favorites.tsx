import { VirtualizedGrid } from '../components/catalog/VirtualizedGrid';
import { useLibraryStore } from '../store/useLibraryStore';
import { CatalogViewToggle } from '../components/catalog/CatalogViewToggle';
import { Heart } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState';
import { HeaderSearch } from '../components/layout/HeaderSearch';
import styles from '../components/layout/AppLayout.module.css';
import { CatalogPageHeader } from '../components/common/CatalogPageHeader';
import { MediaDetailModals } from '../components/modals/MediaDetailModals';
import { useMediaDetailState } from '../hooks/useMediaDetailState';
import { useI18n } from '../i18n';

export function Favorites() {
  const { tn, number } = useI18n();
  const favorites = useLibraryStore((state) => state.favorites);

  const {
    selectedMovie,
    selectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleItemClick,
  } = useMediaDetailState({ enableSourceOnOpen: true });

  return (
    <>
      <div className={styles.page}>
        <CatalogPageHeader
          title="Favorites"
          meta={tn(
            'Your personal library · {count} item',
            'Your personal library · {count} items',
            favorites.length,
            { count: number(favorites.length) },
          )}
          actions={
            <>
              <HeaderSearch onItemClick={handleItemClick} />
              <CatalogViewToggle />
            </>
          }
        />

        {favorites.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Your Favorites is Empty"
            description="Save movies, series, or live channels to your personal library for quick access anytime."
          />
        ) : (
          <div className={styles.catalogContent}>
            <VirtualizedGrid items={favorites} onItemClick={handleItemClick} />
          </div>
        )}
      </div>

      <MediaDetailModals
        selectedMovie={selectedMovie}
        selectedSeries={selectedSeries}
        onCloseMovie={handleCloseMovie}
        onCloseSeries={handleCloseSeries}
      />
    </>
  );
}
