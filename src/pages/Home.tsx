import { useMemo } from 'react';
import { PageTransition } from '../components/layout/PageTransition';
import { HorizontalCarousel } from '../components/shared/HorizontalCarousel';
import { useLibraryStore } from '../store/useLibraryStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { historyCardSubtitle } from '../utils/time';
import { MediaDetailModals } from '../components/modals/MediaDetailModals';
import { useMediaDetailState } from '../hooks/useMediaDetailState';
import { CarouselSkeleton } from '../components/shared/Skeleton';
import { Tv } from 'lucide-react';
import { EmptyState } from '../components/shared/EmptyState';
import { useNavigate } from 'react-router-dom';
import { HeaderSearch } from '../components/layout/HeaderSearch';
import styles from '../App.module.css';
import { useVisibleCatalog } from '../api/useCategories';
import { ErrorState } from '../components/common/ErrorState';
import { getCombinedErrorMessage, getErrorPresentation } from '../utils/error';
import { useEnabledSources } from '../hooks/useEnabledSources';
import { useI18n } from '../i18n';
import { UpcomingReleaseCard } from '../components/upcoming/UpcomingReleaseCard';

export function Home() {
  const { t, language } = useI18n();
  const sources = useEnabledSources();
  const history = useLibraryStore((state) => state.history);
  const upcomingEnabled = useSettingsStore((state) => state.upcomingEnabled);
  const upcomingHomeEnabled = useSettingsStore((state) => state.upcomingHomeEnabled);
  const navigate = useNavigate();
  const hasSource = sources.isAvailable;
  const showUpcomingOnHome = upcomingEnabled && upcomingHomeEnabled;

  const {
    selectedMovie,
    selectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleItemClick,
  } = useMediaDetailState();

  const continueWatchingItems = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history]
      .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt)
      .slice(0, 20)
      .map((h) => ({
        ...h,
        progress: h.progressPercentage ? h.progressPercentage / 100 : undefined,
        subtitle: historyCardSubtitle(h, language),
      }));
  }, [history, language]);

  // Use unified query keys shared across the entire application
  // Home has no category picker, so hidden material should simply never
  // appear here — unlike the catalogue pages, where choosing a hidden
  // category outright still has to work.
  const moviesQuery = useVisibleCatalog('vod');
  const { data: movies = [], isLoading: loadingMovies } = moviesQuery;

  const seriesQuery = useVisibleCatalog('series');
  const { data: series = [], isLoading: loadingSeries } = seriesQuery;

  const liveQuery = useVisibleCatalog('live');
  const { data: liveChannelsData = [], isLoading: loadingLive } = liveQuery;

  const recentMovies = useMemo(() => {
    return [...movies]
      .sort((a, b) => Number.parseInt(b.added || '0', 10) - Number.parseInt(a.added || '0', 10))
      .slice(0, 20);
  }, [movies]);

  const popularSeries = useMemo(() => {
    return [...series]
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 20);
  }, [series]);

  const liveChannels = useMemo(() => {
    return liveChannelsData.slice(0, 20);
  }, [liveChannelsData]);

  const isLoading = loadingMovies || loadingSeries || loadingLive;
  const catalogError = getCombinedErrorMessage([
    moviesQuery.error,
    seriesQuery.error,
    liveQuery.error,
  ], '');
  const hasCatalogData = movies.length > 0 || series.length > 0 || liveChannelsData.length > 0;
  const showLoadError = Boolean(catalogError) && !hasCatalogData;
  const errorPresentation = getErrorPresentation(catalogError, 'Discover');
  const failedCatalogQueries = [moviesQuery, seriesQuery, liveQuery].filter((query) => query.isError);
  const isRetrying = failedCatalogQueries.some((query) => query.isFetching);
  const retryCatalogs = () => {
    void Promise.all(failedCatalogQueries.map((query) => query.refetch()));
  };

  return (
    <PageTransition>
      <div className={styles.page}>
        <div className={`${styles.pageHeader} ${styles.homeHeader}`}>
          <div className={styles.homeTitleGroup}>
            <h1 className={styles.pageTitle}>{t('Discover')}</h1>
            <p className={styles.pageSubtitle}>
              {t("Pick up where you left off and discover what's new")}
            </p>
          </div>
          <div className={styles.homeSearch}>
            <HeaderSearch onItemClick={handleItemClick} placeholder="Search your library" />
          </div>
        </div>

        {!hasSource ? (
          <EmptyState
            icon={Tv}
            title="No Source Available"
            description="Connect an Xtream account or add an M3U playlist to fill Discover with available media."
            actionLabel="Manage Sources"
            onAction={() => navigate('/settings?section=sources')}
          />
        ) : isLoading ? (
          <div className={`${styles.homeScrollContainer} subtle-scrollbar`}>
            {showUpcomingOnHome && <UpcomingReleaseCard onOpen={handleItemClick} onViewAll={() => navigate('/upcoming')} showEmpty />}
            {continueWatchingItems.length > 0 && (
              <CarouselSkeleton title="Continue Watching" />
            )}
            <CarouselSkeleton title="Recently Added Movies" />
            <CarouselSkeleton title="Popular Series" />
            <CarouselSkeleton title="Live TV Channels" isLiveTv />
          </div>
        ) : showLoadError ? (
          <ErrorState
            title={errorPresentation.title}
            description={errorPresentation.description}
            detail={errorPresentation.detail}
            actionLabel="Try Again"
            onAction={retryCatalogs}
            isRetrying={isRetrying}
          />
        ) : (
          <div className={`${styles.homeScrollContainer} subtle-scrollbar`}>
            {showUpcomingOnHome && <UpcomingReleaseCard onOpen={handleItemClick} onViewAll={() => navigate('/upcoming')} showEmpty />}
            {continueWatchingItems.length > 0 && (
              <HorizontalCarousel
                title="Continue Watching"
                items={continueWatchingItems}
                onItemClick={handleItemClick}
                onSeeAll={() => navigate('/continue')}
              />
            )}
            <HorizontalCarousel
              title="Recently Added Movies"
              items={recentMovies}
              onItemClick={handleItemClick}
              onSeeAll={() => navigate('/movies')}
            />
            <HorizontalCarousel
              title="Popular Series"
              items={popularSeries}
              onItemClick={handleItemClick}
              onSeeAll={() => navigate('/series')}
            />
            <HorizontalCarousel
              title="Live TV Channels"
              items={liveChannels}
              onItemClick={handleItemClick}
              onSeeAll={() => navigate('/live')}
              isLiveTv
            />
          </div>
        )}
      </div>

      <MediaDetailModals
        selectedMovie={selectedMovie}
        selectedSeries={selectedSeries}
        onCloseMovie={handleCloseMovie}
        onCloseSeries={handleCloseSeries}
      />
    </PageTransition>
  );
}
