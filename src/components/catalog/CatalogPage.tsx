import { useMemo, useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VirtualizedGrid } from './VirtualizedGrid';
import type { MediaItem } from './MediaCard';
import { CategorySidebar } from '../layout/CategorySidebar';
import { GridSkeleton } from '../shared/Skeleton';
import { CatalogViewToggle } from './CatalogViewToggle';
import { CatalogSortSelect } from './CatalogSortSelect';
import { GenreFilterBar } from './GenreFilterBar';
import { EmptyState } from '../shared/EmptyState';
import { HeaderSearch } from '../layout/HeaderSearch';
import { ErrorState } from '../common/ErrorState';
import { CatalogPageHeader } from '../common/CatalogPageHeader';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useEnabledSources } from '../../hooks/useEnabledSources';
import { useCatalogCategorySelection } from '../../hooks/useCatalogCategorySelection';
import { useCatalogByType } from '../../api/useCatalog';
import { useCategories, useHiddenCategoryIds } from '../../api/useCategories';
import {
  filterItemsBySmartCategory,
  filterItemsByGenre,
  sortCatalogItems,
} from '../../utils/smartCatalogFilter';
import { getCombinedErrorMessage, getErrorPresentation } from '../../utils/error';
import { useI18n } from '../../i18n';
import styles from '../layout/AppLayout.module.css';

export interface CatalogPageProps {
  type: 'vod' | 'series' | 'live';
  title: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  noSourceDescription: string;
  onItemClick: (item: MediaItem) => void;
  onViewDetails?: ((item: MediaItem) => void) | undefined;
  isLiveTv?: boolean | undefined;
}

export function CatalogPage({
  type,
  title,
  icon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  noSourceDescription,
  onItemClick,
  onViewDetails,
  isLiveTv = false,
}: CatalogPageProps) {
  const { t, tn, number } = useI18n();
  const sources = useEnabledSources();
  const viewMode = useSettingsStore((state) => state.viewMode);
  const catalogSortModes = useSettingsStore((state) => state.catalogSortModes);
  const setCatalogSort = useSettingsStore((state) => state.setCatalogSort);
  const currentSortMode = catalogSortModes?.[type] ?? 'default';
  const navigate = useNavigate();
  const [activeCategoryId, setActiveCategoryId] = useCatalogCategorySelection(type);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  // Reset genre when category changes
  useEffect(() => {
    setSelectedGenre(null);
  }, [activeCategoryId]);

  const {
    data: allItems = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useCatalogByType(type);

  const {
    data: categories = [],
    isError: isCategoriesError,
    error: categoriesError,
    isFetching: areCategoriesFetching,
    refetch: refetchCategories,
  } = useCategories(type);

  const hiddenCategoryIds = useHiddenCategoryIds(type);
  const favorites = useLibraryStore((s) => s.favorites);

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(String(cat.category_id), cat.category_name);
    }
    return map;
  }, [categories]);

  const categoryItems = useMemo(() => {
    return filterItemsBySmartCategory(
      allItems,
      activeCategoryId,
      hiddenCategoryIds,
      favorites,
      categories,
    );
  }, [allItems, activeCategoryId, hiddenCategoryIds, favorites, categories]);

  const items = useMemo(() => {
    const genreFiltered = filterItemsByGenre(categoryItems, selectedGenre, categoryNameMap);
    return sortCatalogItems(genreFiltered, currentSortMode);
  }, [categoryItems, selectedGenre, categoryNameMap, currentSortMode]);

  const pageError = getCombinedErrorMessage([error, categoriesError], '');
  const errorPresentation = getErrorPresentation(pageError, title);
  const showLoadError = (isError || isCategoriesError) && allItems.length === 0;

  const retryPage = () => {
    const retries = [
      ...(isError ? [refetch()] : []),
      ...(isCategoriesError ? [refetchCategories()] : []),
    ];
    void Promise.all(retries);
  };

  const getCountMeta = () => {
    if (isLoading) {
      if (type === 'vod') return t('Loading movies');
      if (type === 'series') return t('Loading series');
      return t('Loading channels');
    }
    if (type === 'vod') {
      return tn('{count} movie', '{count} movies', items.length, {
        count: number(items.length),
      });
    }
    if (type === 'series') {
      return tn('{count} series', '{count} series', items.length, {
        count: number(items.length),
      });
    }
    return tn('{count} channel', '{count} channels', items.length, {
      count: number(items.length),
    });
  };

  return (
    <div className={`${styles.page} ${styles.catalogLayout}`}>
      <CategorySidebar
        type={type}
        activeCategoryId={activeCategoryId}
        onSelectCategory={setActiveCategoryId}
      />

      <div className={styles.catalogMain}>
        <CatalogPageHeader
          title={title}
          meta={getCountMeta()}
          actions={
            <>
              <HeaderSearch onItemClick={onItemClick} />
              <CatalogSortSelect
                value={currentSortMode}
                onChange={(sort) => setCatalogSort(type, sort)}
                isLiveTv={isLiveTv}
              />
              <CatalogViewToggle />
            </>
          }
        />

        {isLoading ? (
          <div className={styles.catalogContent}>
            <GridSkeleton
              viewMode={viewMode}
              count={viewMode === 'list' ? 10 : 18}
              isLiveTv={isLiveTv}
            />
          </div>
        ) : showLoadError ? (
          <ErrorState
            title={errorPresentation.title}
            description={errorPresentation.description}
            detail={errorPresentation.detail}
            actionLabel="Try Again"
            onAction={retryPage}
            isRetrying={(isError && isFetching) || (isCategoriesError && areCategoriesFetching)}
          />
        ) : !sources.isAvailable ? (
          <EmptyState
            icon={EmptyIcon}
            title="No Source Available"
            description={noSourceDescription}
            actionLabel="Manage Sources"
            onAction={() => navigate('/settings?section=sources')}
          />
        ) : items.length === 0 ? (
          <div className={styles.catalogContent}>
            {type !== 'live' && categoryItems.length > 0 && (
              <GenreFilterBar
                items={categoryItems}
                selectedGenre={selectedGenre}
                onSelectGenre={setSelectedGenre}
                categoryNameMap={categoryNameMap}
              />
            )}
            <EmptyState icon={EmptyIcon} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <div className={styles.catalogContent}>
            {type !== 'live' && (
              <GenreFilterBar
                items={categoryItems}
                selectedGenre={selectedGenre}
                onSelectGenre={setSelectedGenre}
                categoryNameMap={categoryNameMap}
              />
            )}
            <VirtualizedGrid
              items={items}
              isLiveTv={isLiveTv}
              showTypeInList={false}
              onItemClick={onItemClick}
              onViewDetails={onViewDetails}
            />
          </div>
        )}
      </div>
    </div>
  );
}
