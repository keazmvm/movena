import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Heart, MonitorPlay, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getM3uSeriesGroups } from '../../api/m3u';
import { useSourceStore } from '../../store/useSourceStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { DetailModalShell } from '../common/DetailModalShell';
import { ErrorState } from '../common/ErrorState';
import { parseEpisodeTitle, parseMediaDisplayTitle, formatEpisodePlaybackTitle } from '../../utils/titleParser';
import styles from './SeriesDetailModal.module.css';
import { useI18n } from '../../i18n';
import { SeriesUpcomingEpisodes } from '../upcoming/SeriesUpcomingEpisodes';
import { episodeScheduleKey } from '../../utils/upcoming';
import { Select } from '../shared/Select';

interface M3uSeriesDetailModalProps {
  seriesId: string;
  seriesTitle: string;
  seriesPoster: string;
  sourceId: string;
  sourceItemId?: string | undefined;
  initialSeasonNumber?: number | undefined;
  initialEpisodeNumber?: number | undefined;
  onClose: () => void;
}

export function M3uSeriesDetailModal({
  seriesId,
  seriesTitle,
  seriesPoster,
  sourceId,
  sourceItemId,
  initialSeasonNumber,
  initialEpisodeNumber,
  onClose,
}: M3uSeriesDetailModalProps) {
  const { t, number } = useI18n();
  const navigate = useNavigate();
  const titleId = useId();
  const playlist = useSourceStore((state) => state.runtimes[sourceId]?.playlist);
  const episodes = useMemo(
    () => playlist ? getM3uSeriesGroups(playlist).get(sourceItemId || seriesId) : undefined,
    [playlist, seriesId, sourceItemId],
  );
  const playStream = usePlayerStore((state) => state.playStream);
  const isFavorite = useLibraryStore((state) => state.favorites.some((item) => item.id === seriesId));
  const addFavorite = useLibraryStore((state) => state.addFavorite);
  const removeFavorite = useLibraryStore((state) => state.removeFavorite);
  const historyItem = useLibraryStore((state) => state.history.find((item) => item.id === seriesId));
  const parsedSeries = parseMediaDisplayTitle(seriesTitle);
  const [selectedSeason, setSelectedSeason] = useState('');
  const requestedEpisodeRef = useRef<HTMLButtonElement>(null);
  const positionedEpisodeRef = useRef(false);
  const seasons = useMemo(() => Array.from(new Set(
    (episodes ?? []).map((entry) => String(entry.episode!.seasonNumber)),
  )).sort((left, right) => Number(left) - Number(right)), [episodes]);
  const seasonOptions = useMemo(() => seasons.map((season) => ({
    value: season,
    label: t('Season {number}', { number: season }),
  })), [seasons, t]);
  const visibleEpisodes = useMemo(() => (
    selectedSeason
      ? (episodes ?? []).filter((entry) => String(entry.episode!.seasonNumber) === selectedSeason)
      : []
  ), [episodes, selectedSeason]);
  const resumeEpisode = useMemo(() => {
    if (!historyItem) return undefined;
    return (episodes ?? []).find((entry) => (
      entry.id === historyItem.episodeId?.toString()
      || (String(entry.episode!.seasonNumber) === historyItem.seasonNum?.toString()
        && entry.episode!.episodeNumber === Number(historyItem.episodeNum))
    ));
  }, [episodes, historyItem]);
  const primaryEpisode = resumeEpisode ?? visibleEpisodes[0];
  const availableEpisodeKeys = useMemo(() => new Set(
    (episodes ?? []).map((entry) => episodeScheduleKey(entry.episode!.seasonNumber, entry.episode!.episodeNumber)),
  ), [episodes]);

  useEffect(() => {
    setSelectedSeason('');
    positionedEpisodeRef.current = false;
  }, [initialEpisodeNumber, initialSeasonNumber, seriesId]);

  useEffect(() => {
    if (!seasons.length || selectedSeason) return;
    const requestedSeason = initialSeasonNumber?.toString();
    const savedSeason = historyItem?.seasonNum?.toString();
    setSelectedSeason(
      requestedSeason && seasons.includes(requestedSeason)
        ? requestedSeason
        : savedSeason && seasons.includes(savedSeason)
          ? savedSeason
          : seasons[0] ?? '',
    );
  }, [historyItem?.seasonNum, initialSeasonNumber, seasons, selectedSeason]);

  useEffect(() => {
    if (
      positionedEpisodeRef.current
      || !initialEpisodeNumber
      || (initialSeasonNumber && selectedSeason !== String(initialSeasonNumber))
      || !requestedEpisodeRef.current
    ) return;
    positionedEpisodeRef.current = true;
    requestedEpisodeRef.current.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [initialEpisodeNumber, initialSeasonNumber, selectedSeason, visibleEpisodes]);

  if (!episodes?.length) {
    return <DetailModalShell onClose={onClose} ariaLabel="Series details" stateLayout><ErrorState modal title="Series unavailable" description="This playlist series is no longer available. Refresh the source and try again." detail={`No playable M3U series episodes matched item "${sourceItemId || seriesId}" in source "${sourceId}".`} actionLabel="Close" onAction={onClose} /></DetailModalShell>;
  }
  const play = (entry: typeof episodes[number], startPosition = 0) => {
    const episode = entry.episode!;
    const parsedEpisode = parseEpisodeTitle(entry.title, { seriesTitle: parsedSeries.cleanTitle, seasonNum: episode.seasonNumber, episodeNum: episode.episodeNumber });
    playStream({
      id: entry.id, sourceItemId: entry.id, sourceId, type: 'series', streamUrl: entry.url, httpHeaders: entry.headers,
      title: formatEpisodePlaybackTitle(parsedSeries.cleanTitle, String(episode.seasonNumber), episode.episodeNumber, parsedEpisode.cleanTitle),
      posterUrl: entry.logo || seriesPoster, seriesPosterUrl: seriesPoster, seriesId, seriesSourceItemId: sourceItemId || seriesId,
      seriesTitle: parsedSeries.cleanTitle, seasonNum: String(episode.seasonNumber), episodeNum: episode.episodeNumber, episodeTitle: parsedEpisode.cleanTitle,
      startPosition,
      knownDuration: entry.duration > 0 ? entry.duration : historyItem?.duration,
    });
    onClose();
  };
  return (
    <DetailModalShell onClose={onClose} labelledBy={titleId}>
      <div className={styles.content}>
        <div className={`${styles.posterColumn} subtle-scrollbar`}>
          <div className={styles.posterWrapper}>{seriesPoster ? <img src={seriesPoster} alt={parsedSeries.cleanTitle} className={styles.poster} /> : <div className={styles.posterPlaceholder}><MonitorPlay size={44} /><span>{parsedSeries.cleanTitle}</span></div>}</div>
          <div className={styles.actionButtons}>
            {primaryEpisode && (
              <button
                type="button"
                className={styles.playBtn}
                onClick={() => play(primaryEpisode, resumeEpisode ? historyItem?.currentTime ?? 0 : 0)}
                data-modal-primary
              >
                <Play size={20} fill="currentColor" />
                <span>{resumeEpisode
                  ? `${t(historyItem?.currentTime ? 'Resume' : 'Play')} S${resumeEpisode.episode!.seasonNumber}:E${resumeEpisode.episode!.episodeNumber}`
                  : t('Start Watching')}</span>
              </button>
            )}
            <button type="button" className={`${styles.favoriteBtn} ${isFavorite ? styles.activeFavoriteBtn : ''}`} onClick={() => isFavorite ? removeFavorite(seriesId) : addFavorite({ id: seriesId, sourceItemId: sourceItemId || seriesId, sourceId, title: parsedSeries.cleanTitle, posterUrl: seriesPoster, type: 'series' })} aria-label={t(isFavorite ? 'Remove from favorites' : 'Add to favorites')} aria-pressed={isFavorite}><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} /><span>{t(isFavorite ? 'In Favorites' : 'Add to Favorites')}</span></button>
          </div>
        </div>
        <div className={`${styles.detailsArea} subtle-scrollbar`}>
          <h1 className={styles.title} id={titleId}>{parsedSeries.cleanTitle}</h1>
          <section className={styles.episodeSection} aria-label={t('Episodes')}>
            <div className={styles.episodeBrowserHeader}>
              <Select value={selectedSeason} options={seasonOptions} onChange={setSelectedSeason} width={180} />
            </div>
            <div className={styles.episodesList}>{visibleEpisodes.map((entry) => {
              const episode = entry.episode!;
              const isRequestedEpisode = initialEpisodeNumber === episode.episodeNumber
                && (!initialSeasonNumber || initialSeasonNumber === episode.seasonNumber);
              return <button type="button" key={entry.id} ref={isRequestedEpisode ? requestedEpisodeRef : undefined} className={`${styles.episodeCard} ${isRequestedEpisode ? styles.requestedEpisodeCard : ''}`} onClick={() => play(entry)} aria-current={isRequestedEpisode ? 'true' : undefined} aria-label={t('Play season {season}, episode {episode}', { season: number(episode.seasonNumber), episode: number(episode.episodeNumber) })}><div className={styles.episodeImageWrapper}>{entry.logo ? <img src={entry.logo} alt="" className={styles.episodeImage} /> : <MonitorPlay size={22} />}</div><div className={styles.episodeInfo}><div className={styles.episodeHeaderLine}><span className={styles.episodeBadge}>E{episode.episodeNumber}</span><span className={styles.episodeTitle}>{episode.episodeTitle || entry.title}</span></div>{entry.description && <p className={styles.episodePlot}>{entry.description}</p>}</div><Play size={18} /></button>;
            })}
              <SeriesUpcomingEpisodes
                seriesId={seriesId}
                availableEpisodeKeys={availableEpisodeKeys}
                onViewSchedule={() => {
                  onClose();
                  navigate('/upcoming');
                }}
              />
            </div>
          </section>
        </div>
      </div>
    </DetailModalShell>
  );
}
