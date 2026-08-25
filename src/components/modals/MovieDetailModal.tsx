import { useId, useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp, Clock, Download, Film, Heart, Play, RotateCcw, Settings, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getXtreamCredentials, useAuthStore } from '../../store/useAuthStore';
import { getStreamUrl } from '../../api/xc';
import { useVodInfo } from '../../api/useDetails';
import { usePlayerStore } from '../../store/usePlayerStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { formatRemaining } from '../../utils/time';
import { parseMediaDisplayTitle } from '../../utils/titleParser';
import { getPrimaryMediaTags, getTagColorType } from '../../utils/mediaTags';
import { countryName } from '../../utils/categoryName';
import { MovieDetailSkeleton } from '../shared/Skeleton';
import { DetailModalShell } from '../common/DetailModalShell';
import { ErrorState } from '../common/ErrorState';
import { getErrorMessage, getErrorPresentation } from '../../utils/error';
import styles from './MovieDetailModal.module.css';
import { searchTmdb, getTmdbMovie } from '../../api/tmdb';
import { useSettingsStore } from '../../store/useSettingsStore';
import { downloadMediaItem } from '../../services/mediaDownload';
import { M3uMovieDetailModal } from './M3uMovieDetailModal';
import { useI18n } from '../../i18n';
import { uiLanguageDefinition } from '../../i18nConfig';
import { notify } from '../../store/useNotificationStore';

interface MovieDetailModalProps {
  movieId: string;
  movieTitle: string;
  moviePoster: string;
  sourceId?: string | undefined;
  sourceItemId?: string | undefined;
  onClose: () => void;
}

export function MovieDetailModal(props: MovieDetailModalProps) {
  if (props.sourceId?.startsWith('m3u-')) {
    return <M3uMovieDetailModal {...props} sourceId={props.sourceId} />;
  }
  return <XtreamMovieDetailModal {...props} />;
}

function XtreamMovieDetailModal({ movieId, movieTitle, moviePoster, sourceId, sourceItemId, onClose }: MovieDetailModalProps) {
  const { t, language, number } = useI18n();
  const navigate = useNavigate();
  const credentials = useAuthStore((state) => {
    const resolvedSourceId = sourceId === 'xtream' ? state.profiles[0]?.id : sourceId;
    return resolvedSourceId ? state.runtimes[resolvedSourceId]?.credentials ?? null : getXtreamCredentials();
  });
  const providerMovieId = sourceItemId || movieId;
  const tmdbApiKey = useSettingsStore((state) => state.tmdbApiKey);
  const tmdbEnabled = useSettingsStore((state) => state.tmdbEnabled);
  const tmdbLanguage = useSettingsStore((state) => state.tmdbLanguage);
  const tmdbImageSize = useSettingsStore((state) => state.tmdbImageSize);
  const tmdbIncludeAdult = useSettingsStore((state) => state.tmdbIncludeAdult);
  const appLanguage = useSettingsStore((state) => state.language);
  const playStream = usePlayerStore((state) => state.playStream);
  const [imageError, setImageError] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const titleId = useId();
  
  const isFav = useLibraryStore(state => state.favorites.some(f => f.id === movieId));
  const addFavorite = useLibraryStore(state => state.addFavorite);
  const removeFavorite = useLibraryStore(state => state.removeFavorite);

  const { data, isLoading, error, isFetching, refetch } = useVodInfo(providerMovieId, sourceId);
  const [enriched, setEnriched] = useState<Awaited<ReturnType<typeof getTmdbMovie>>>(null);
  useEffect(() => {
    if (!tmdbEnabled || !tmdbApiKey.trim() || !movieTitle.trim()) {
      setEnriched(null);
      return;
    }
    const language = tmdbLanguage === 'auto'
      ? uiLanguageDefinition(appLanguage).locale
      : tmdbLanguage;
    const options = {
      language,
      includeAdult: tmdbIncludeAdult,
      imageSize: tmdbImageSize,
    } as const;
    const controller = new AbortController();
    void searchTmdb(tmdbApiKey, movieTitle, controller.signal, options)
      .then((search) => {
        const movie = search.results.find((result) => result.mediaType === 'movie');
        return movie ? getTmdbMovie(tmdbApiKey, movie.id, controller.signal, options) : null;
      })
      .then((movie) => { if (!controller.signal.aborted) setEnriched(movie); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setEnriched(null);
        notify.warning('TMDB Enrichment Failed', getErrorMessage(error, 'TMDB enrichment failed without an error message.'), undefined, undefined, 'connection');
      });
    return () => controller.abort();
  }, [appLanguage, movieTitle, tmdbApiKey, tmdbEnabled, tmdbImageSize, tmdbIncludeAdult, tmdbLanguage]);
  const toggleFavorite = () => {
    if (isFav) removeFavorite(movieId);
    else addFavorite({
      id: movieId,
      title: movieTitle,
      posterUrl: moviePoster,
      type: 'vod',
      sourceItemId: providerMovieId,
      streamUrl: data?.movie_data.direct_stream_url,
      httpHeaders: data?.movie_data.http_headers,
      sourceId: data?.movie_data.source_id,
      containerExtension: data?.movie_data.container_extension,
      description: data?.info.description || data?.info.plot,
    });
  };
  const [isRetryingDetails, setIsRetryingDetails] = useState(false);
  const prerequisiteError = !credentials
    ? `No credentials are loaded for Xtream source "${sourceId ?? 'default'}".`
    : !String(providerMovieId).trim()
      ? 'Movie details cannot be loaded because the provider item id is empty.'
      : null;
  const effectiveError = error ?? prerequisiteError;
  const errorPresentation = getErrorPresentation(effectiveError, 'Movie details');
  const [retryPresentation, setRetryPresentation] = useState<typeof errorPresentation | null>(null);
  const visibleErrorPresentation = retryPresentation ?? errorPresentation;
  const showErrorState = !data && (!!effectiveError || isRetryingDetails);

  const retryDetails = async () => {
    setRetryPresentation(errorPresentation);
    setIsRetryingDetails(true);
    try {
      await refetch();
    } finally {
      setIsRetryingDetails(false);
      setRetryPresentation(null);
    }
  };

  const historyItem = useLibraryStore(state => state.history.find(h => h.id === movieId));
  const remainingLabel = formatRemaining(historyItem?.currentTime, historyItem?.duration, language);

  const providerReleaseYear = data?.info.releaseDate
    ? new Date(data.info.releaseDate).getFullYear()
    : NaN;
  const releaseYear = enriched?.releaseYear ?? providerReleaseYear;
  const parsedTitle = parseMediaDisplayTitle(
    data?.info.name || movieTitle,
    Number.isFinite(releaseYear) ? String(releaseYear) : undefined,
  );
  const plot = enriched?.overview || data?.info.description || data?.info.plot || t('No description available.');
  const castList = useMemo(() => {
    const tmdbCast = enriched?.credits?.cast.map((credit) => credit.name).filter(Boolean) ?? [];
    return tmdbCast.length > 0 ? tmdbCast : (data?.info.cast?.split(/\s*,\s*/).filter(Boolean) ?? []);
  }, [data?.info.cast, enriched?.credits.cast]);
  const director = enriched?.credits?.crew.find((credit) => (
    credit.job === 'Director' || credit.jobs.includes('Director')
  ))?.name || data?.info.director;
  const rating = enriched?.voteAverage ?? data?.info.rating;
  const genres = enriched?.genres.map((genre) => genre.name).filter(Boolean).join(' / ') || data?.info.genre?.replace(/\s*,\s*/g, ' / ');
  const duration = enriched?.runtimeMinutes ? t('{count} min', { count: number(enriched.runtimeMinutes) }) : data?.info.duration;
  const displayCountry = parsedTitle.country ? countryName(parsedTitle.country, language) : null;
  const hasMoreDetails = plot.length > 280 || castList.length > 4;
  const progress = Math.min(100, Math.max(0, historyItem?.progressPercentage || 0));
  // Real (landscape) backdrop art only — movie_image/moviePoster are 2:3
  // posters, and background-size: cover on this ~4:1 strip would crop one
  // down to a near-arbitrary sliver of itself rather than gracefully
  // letterbox it, so those aren't acceptable fallbacks here.
  const backdropUrl = enriched?.backdropUrl || data?.info.backdrop_path?.[0];

  const handlePlay = (startFromBeginning = false) => {
    if (!data) return;
    const streamUrl = data.movie_data.direct_stream_url
      || (credentials ? getStreamUrl(credentials, 'vod', providerMovieId, data.movie_data.container_extension || 'mp4') : '');
    if (!streamUrl) return;
    const startPos = startFromBeginning ? 0 : (historyItem?.currentTime || 0);
    playStream({
      id: movieId,
      sourceItemId: providerMovieId,
      title: parsedTitle.cleanTitle,
      type: 'vod',
      streamUrl,
      httpHeaders: data.movie_data.http_headers,
      sourceId: data.movie_data.source_id || sourceId,
      posterUrl: data.info.movie_image || moviePoster,
      startPosition: startPos,
      knownDuration: historyItem?.duration,
      tags: parsedTitle.tags,
      country: parsedTitle.country,
    });
    onClose();
  };

  const handleDownload = () => {
    if (!data) return;
    const streamUrl = data.movie_data.direct_stream_url
      || (credentials ? getStreamUrl(credentials, 'vod', providerMovieId, data.movie_data.container_extension || 'mp4') : '');
    void downloadMediaItem({
      title: parsedTitle.cleanTitle,
      type: 'vod',
      streamUrl,
      httpHeaders: data.movie_data.http_headers,
      containerExtension: data.movie_data.container_extension,
    });
  };

  return (
    <DetailModalShell
      onClose={onClose}
      labelledBy={data ? titleId : undefined}
      ariaLabel="Movie details"
      modalClassName={showErrorState ? undefined : styles.movieModal}
      stateLayout={showErrorState}
    >
      {showErrorState ? (
        <ErrorState
          modal
          title={visibleErrorPresentation.title}
          description={visibleErrorPresentation.description}
          detail={visibleErrorPresentation.detail}
          actionIcon={!error && !credentials ? Settings : undefined}
          actionLabel={error ? 'Try Again' : !credentials ? 'Open Settings' : 'Close'}
          onAction={error
            ? () => void retryDetails()
            : !credentials ? () => { onClose(); navigate('/settings?section=sources'); } : onClose}
          isRetrying={isRetryingDetails || isFetching}
        />
      ) : isLoading ? (
        <MovieDetailSkeleton />
      ) : data ? (
        <>
          {/* Backdrop hero layer — omitted when no real backdrop art exists. */}
          {backdropUrl && (
            <div className={styles.backdropContainer}>
              <div className={styles.backdrop} style={{ backgroundImage: `url(${backdropUrl})` }} />
              <div className={styles.backdropOverlay} />
            </div>
          )}

          <div className={styles.content}>
            {/* Left: Poster column with cover + action buttons */}
            <div className={`${styles.posterColumn} subtle-scrollbar`}>
              <div className={styles.posterWrapper}>
                {imageError || !(enriched?.posterUrl || data.info.movie_image || moviePoster) ? (
                  <div className={styles.posterPlaceholder}>
                    <Film size={44} className={styles.posterPlaceholderIcon} />
                    <span className={styles.posterPlaceholderTitle}>{parsedTitle.cleanTitle}</span>
                  </div>
                ) : (
                  <img 
                    src={enriched?.posterUrl || data.info.movie_image || moviePoster} 
                    alt={parsedTitle.cleanTitle}
                    className={styles.poster} 
                    onError={() => setImageError(true)}
                  />
                )}
              </div>

              {/* Action Buttons below cover */}
              <div className={styles.actionButtons}>
                {historyItem && historyItem.currentTime ? (
                  <>
                    <button
                      type="button"
                      className={styles.playBtn}
                      onClick={() => handlePlay(false)}
                      data-modal-primary
                    >
                      <Play size={20} fill="currentColor" />
                      <span className={styles.playBtnLabel}>
                        <span>{t('Resume')}</span>
                        {remainingLabel && (
                          <span className={styles.playBtnHint}>{remainingLabel}</span>
                        )}
                      </span>
                      {progress > 0 && (
                        <span className={styles.actionProgress} aria-hidden="true">
                          <span className={styles.actionProgressFill} style={{ width: `${progress}%` }} />
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => handlePlay(true)}
                    >
                      <RotateCcw size={16} />
                      <span>{t('Start Over')}</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.playBtn}
                    onClick={() => handlePlay(false)}
                    data-modal-primary
                  >
                    <Play size={20} fill="currentColor" />
                    <span>{t('Play Movie')}</span>
                  </button>
                )}

                <div className={styles.iconActionRow}>
                  <button
                    type="button"
                    className={`${styles.favoriteBtn} ${styles.iconActionButton} ${isFav ? styles.activeFavoriteBtn : ''}`}
                    onClick={toggleFavorite}
                    aria-label={t(isFav ? 'Remove from favorites' : 'Add to favorites')}
                    aria-pressed={isFav}
                  >
                    <Heart size={18} fill={isFav ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.secondaryBtn} ${styles.iconActionButton}`}
                    onClick={handleDownload}
                    aria-label={t('Download movie')}
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Main details & credits */}
            <div className={`${styles.detailsArea} subtle-scrollbar`}>
              <h1 id={titleId} className={styles.title}>{parsedTitle.cleanTitle}</h1>

              {/* Media Facts Bar */}
              <div className={styles.mediaFacts}>
                {Number.isFinite(releaseYear) && <span className={styles.factItem}>{releaseYear}</span>}
                {duration && (
                  <span className={styles.factItem}>
                    <Clock size={14} /> {duration}
                  </span>
                )}
                {rating !== null && rating !== undefined && rating !== '' && (
                  <span className={styles.factItem}>
                    <Star size={14} fill="currentColor" className={styles.starIcon} /> {rating}
                  </span>
                )}
                {genres && (
                  <span className={styles.factItem}>{genres}</span>
                )}
                {displayCountry && <span className={styles.factItem}>{displayCountry}</span>}
                {getPrimaryMediaTags(parsedTitle.tags).map((tag) => (
                  <span
                    key={tag}
                    className={`${styles.factItem} ${styles.technicalFact}`}
                    data-tag-type={getTagColorType(tag)}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Synopsis plot */}
              <div className={`${styles.plot} ${detailsExpanded ? styles.expandedText : styles.collapsedText}`}>
                {plot}
              </div>

              {hasMoreDetails && (
                <button
                  type="button"
                  className={styles.detailsToggle}
                  onClick={() => setDetailsExpanded((expanded) => !expanded)}
                  aria-expanded={detailsExpanded}
                >
                  {detailsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {t(detailsExpanded ? 'Show less' : 'More details')}
                </button>
              )}

              {/* Director & Cast Credits */}
              {(director || castList.length > 0) && (
                <div className={styles.creditsSection}>
                  {director && (
                    <div className={styles.creditBlock}>
                      <span className={styles.creditLabel}>{t('Director')}</span>
                      <span className={styles.creditValue}>{director}</span>
                    </div>
                  )}
                  {castList.length > 0 && (
                    <div className={styles.creditBlock}>
                      <span className={styles.creditLabel}>{t('Cast')}</span>
                      <div className={styles.castTags}>
                        {(detailsExpanded ? castList : castList.slice(0, 6)).map((actor, idx) => (
                          <span key={idx} className={styles.castTag}>
                            {actor}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </DetailModalShell>
  );
}


