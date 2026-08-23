import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { RiSkipForwardFill } from '../shared/icons';
import { tauriApi } from '../../api/ipc';
import { usePlayerStore } from '../../store/usePlayerStore';
import { getXtreamCredentials, useAuthStore } from '../../store/useAuthStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useSeriesInfo } from '../../api/useDetails';
import { findNextEpisode } from '../../utils/seriesNavigation';
import { findIntroChapter, findOutroChapter } from '../../utils/chapters';
import {
  formatEpisodePlaybackTitle,
  getSeriesBaseTitle,
  parseEpisodeTitle,
} from '../../utils/titleParser';
import { mergeMediaTags } from '../../utils/mediaTags';
import styles from './SeriesPlaybackPrompts.module.css';
import { resolveEpisodePlayback } from '../../utils/playback';
import { xtreamItemId } from '../../utils/sourceIdentity';
import { useI18n } from '../../i18n';

/** How long the auto-play prompt waits before it actually advances. */
const AUTO_PLAY_COUNTDOWN_SECONDS = 8;

/**
 * Everything about moving between episodes that isn't the seekbar: the Skip
 * Intro button, the Next Episode prompt that appears once the credits roll,
 * and the auto-play countdown once mpv reports the file has actually ended.
 * Renders nothing outside of series playback.
 */
export function SeriesPlaybackPrompts() {
  const { t, number } = useI18n();
  const activeStream = usePlayerStore((s) => s.activeStream);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const eofReached = usePlayerStore((s) => s.eofReached);
  const chapters = usePlayerStore((s) => s.chapters);
  const playStream = usePlayerStore((s) => s.playStream);
  const credentials = useAuthStore((s) => (
    activeStream?.sourceId ? s.runtimes[activeStream.sourceId]?.credentials ?? null : getXtreamCredentials()
  ));
  const autoPlayNextEpisode = useSettingsStore((s) => s.autoPlayNextEpisode);
  const skipIntroEnabled = useSettingsStore((s) => s.skipIntroEnabled);

  const isSeries = activeStream?.type === 'series';

  // Shared with VodControls, so this is normally already in cache by the
  // time it's needed — no extra fetch on top of what the controls do.
  const { data: seriesData } = useSeriesInfo(
    activeStream?.seriesSourceItemId || activeStream?.seriesId,
    activeStream?.sourceId,
    isSeries,
  );

  const next = useMemo(() => {
    if (!isSeries || !seriesData?.episodes || !activeStream) return null;
    return findNextEpisode(seriesData.episodes, activeStream.sourceItemId || activeStream.id, activeStream.seasonNum);
  }, [isSeries, seriesData, activeStream]);

  const nextEpisodeDisplayTitle = useMemo(() => {
    if (!next || !activeStream) return null;
    return parseEpisodeTitle(next.episode.title, {
      seriesTitle: activeStream.seriesTitle || getSeriesBaseTitle(activeStream.title),
      seasonNum: next.seasonNum,
      episodeNum: next.episode.episode_num,
    }).cleanTitle;
  }, [next, activeStream]);

  const playNext = useCallback(() => {
    if (!next || !activeStream?.seriesId) return;
    const playback = resolveEpisodePlayback(next.episode, credentials);
    if (!playback) return;
    const seriesTitle = getSeriesBaseTitle(
      seriesData?.info?.name || activeStream.seriesTitle || activeStream.title,
    ) || 'Series';
    const parsedEpisode = parseEpisodeTitle(next.episode.title, {
      seriesTitle,
      seasonNum: next.seasonNum,
      episodeNum: next.episode.episode_num,
    });
    playStream({
      id: activeStream.sourceId?.startsWith('xtream-')
        ? xtreamItemId(activeStream.sourceId, 'episode', next.episode.id)
        : next.episode.id,
      sourceItemId: next.episode.id.toString(),
      title: formatEpisodePlaybackTitle(
        seriesTitle,
        next.seasonNum,
        next.episode.episode_num,
        next.episode.title,
      ),
      type: 'series',
      ...playback,
      posterUrl: next.episode.info?.movie_image || activeStream.posterUrl,
      seriesPosterUrl: activeStream.seriesPosterUrl,
      seriesId: activeStream.seriesId,
      seriesSourceItemId: activeStream.seriesSourceItemId,
      seriesTitle,
      seasonNum: next.seasonNum,
      episodeNum: next.episode.episode_num,
      episodeTitle: parsedEpisode.cleanTitle,
      tags: mergeMediaTags(...(activeStream.tags ?? []), ...parsedEpisode.tags),
      country: activeStream.country ?? parsedEpisode.country,
    });
  }, [next, credentials, activeStream, seriesData, playStream]);

  // ── Skip Intro ────────────────────────────────────────────────

  const introChapter = useMemo(
    () => (skipIntroEnabled ? findIntroChapter(chapters) : null),
    [chapters, skipIntroEnabled]
  );
  const showSkipIntro =
    !!introChapter && currentTime >= introChapter.start && currentTime < introChapter.skipTo - 0.5;

  const skipIntro = useCallback(() => {
    if (!introChapter) return;
    void tauriApi.mpvSeek(introChapter.skipTo);
  }, [introChapter]);

  // ── Next Episode button once the credits start ─────────────────
  //
  // Only shown against a real outro/credits chapter — a fixed "last N
  // seconds" fallback sounded reasonable but doesn't line up with when the
  // credits actually start (that varies a lot per episode), so it just
  // showed up too early. No chapter means no button, same as Skip Intro.

  const outroChapter = useMemo(() => findOutroChapter(chapters), [chapters]);
  const showNextEpisodeButton =
    isSeries && !!next && !!outroChapter && currentTime >= outroChapter.start && !eofReached;

  // ── Auto-play countdown once mpv reports the file actually ended ──

  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimer = useRef<number | null>(null);
  // Guards against re-arming for the same episode — eof-reached can flip
  // back to false and true again if someone seeks around after it fires.
  const firedForRef = useRef<string | null>(null);

  const clearCountdown = useCallback(() => {
    if (countdownTimer.current !== null) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
  }, []);

  useEffect(() => {
    firedForRef.current = null;
    setCountdown(null);
    clearCountdown();
  }, [activeStream?.id, clearCountdown]);


  useEffect(() => {
    if (!eofReached || !isSeries || !next || !autoPlayNextEpisode) return;
    const streamKey = activeStream?.id?.toString() ?? '';
    if (firedForRef.current === streamKey) return;
    firedForRef.current = streamKey;

    let remaining = AUTO_PLAY_COUNTDOWN_SECONDS;
    setCountdown(remaining);
    countdownTimer.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearCountdown();
        setCountdown(null);
        playNext();
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    return clearCountdown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eofReached, isSeries, !!next, autoPlayNextEpisode]);

  const cancelCountdown = useCallback(() => {
    clearCountdown();
    setCountdown(null);
  }, [clearCountdown]);

  if (!isSeries || !activeStream) return null;

  return (
    <>
      {showSkipIntro && (
        <button type="button" className={styles.skipIntroBtn} onClick={skipIntro} onDoubleClick={(e) => e.stopPropagation()}>
          {t('Skip Intro')}
        </button>
      )}

      {countdown !== null ? (
        <div className={styles.nextEpisodeCard} onClick={(e) => e.stopPropagation()}>
          <span className={styles.nextEpisodeLabel}>
            {t('Next episode in {seconds}s', { seconds: number(countdown) })}
            {nextEpisodeDisplayTitle ? ` — ${nextEpisodeDisplayTitle}` : ''}
          </span>
          <div className={styles.nextEpisodeActions}>
            <button type="button" className={styles.nextEpisodePlayBtn} onClick={playNext}>
              <RiSkipForwardFill size={14} /> {t('Play Now')}
            </button>
            <button type="button" className={styles.nextEpisodeCancelBtn} onClick={cancelCountdown}>
              <X size={14} /> {t('Cancel')}
            </button>
          </div>
        </div>
      ) : (
        showNextEpisodeButton && (
          <button type="button"
            className={styles.nextEpisodeSimpleBtn}
            onClick={(e) => {
              e.stopPropagation();
              playNext();
            }}
          >
            <RiSkipForwardFill size={16} /> {t('Next Episode')}
          </button>
        )
      )}
    </>
  );
}
