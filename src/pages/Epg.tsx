import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CalendarClock, ChevronLeft, ChevronRight, Minus, Play, Plus, Tv, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { CategorySidebar } from '../components/layout/CategorySidebar';
import { EmptyState } from '../components/shared/EmptyState';
import { useChannelEpg, type EpgProgramme } from '../api/useEpg';
import { lookupXmltvChannel, useXmltvGuide, type XmltvGuide } from '../api/xmltv';
import { useCategories, useHiddenCategoryIds } from '../api/useCategories';
import { useLiveStreams } from '../api/useCatalog';
import type { CatalogItem } from '../api/useCatalog';
import { getXtreamCredentials, selectPrimaryXtreamCredentials, useAuthStore } from '../store/useAuthStore';
import { useSourceStore } from '../store/useSourceStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import appStyles from '../components/layout/AppLayout.module.css';
import styles from './Epg.module.css';
import {
  cleanProviderDescription,
  parseLiveChannelTitle,
  type CustomTitleRule,
} from '../utils/titleParser';
import { ErrorState } from '../components/common/ErrorState';
import { getCombinedErrorMessage, getErrorMessage, getErrorPresentation } from '../utils/error';
import { playableFromMediaItem } from '../utils/playback';
import { useEnabledSources } from '../hooks/useEnabledSources';
import { CatalogPageHeader } from '../components/common/CatalogPageHeader';
import { filterItemsBySmartCategory } from '../utils/smartCatalogFilter';
import { resolveM3uCatchupUrl, resolveXtreamCatchupUrl } from '../utils/catchup';
import { useCatalogCategorySelection } from '../hooks/useCatalogCategorySelection';
import { useI18n } from '../i18n';
import { useLogoAspect } from '../hooks/useLogoAspect';
import { epgNowScrollLeft } from '../utils/epgGeometry';

function EpgChannelLogo({ posterUrl, channelKey, sourceId }: { posterUrl?: string | undefined; channelKey: string; sourceId?: string | undefined }) {
  const logoAspect = useLogoAspect(posterUrl, channelKey, sourceId);
  const aspectClass = logoAspect === '16:9' ? styles.logoUnsquish169 : (logoAspect === '4:3' ? styles.logoUnsquish43 : '');

  if (!posterUrl) {
    return (
      <span className={styles.channelLogoFallback}>
        <Tv size={16} />
      </span>
    );
  }

  return (
    <img
      className={`${styles.channelLogo} ${aspectClass}`}
      src={posterUrl}
      alt=""
      loading="lazy"
    />
  );
}

/* ── Geometry ─────────────────────────────────────────────────
   The guide is one scroll container in both directions. The channel column and
   the time ruler stay put with CSS `position: sticky` rather than by mirroring
   scroll offsets in JavaScript, which is what makes the two axes track the
   picture exactly instead of a frame behind it. */

const ROW_HEIGHT = 68;
const RULER_HEIGHT = 44;

/* The channel column is part of the same scrolled canvas, so everything placed
   by time has to start after it. Both sides read this one number: the constant
   drives the layout maths here, and the same value reaches the stylesheet as
   `--channel-width`, so the ruler and the lanes cannot drift apart. */
const CHANNEL_WIDTH = 248;

/** Continuous zoom: 100% is 270px per hour, ranging from 135px to 540px. */
const BASE_PIXELS_PER_MINUTE = 4.5;
const MIN_ZOOM_PERCENT = 50;
const MAX_ZOOM_PERCENT = 200;
const DEFAULT_ZOOM_PERCENT = 100;

/** How much of the past the guide keeps, so "just finished" stays reachable. */
const HOURS_BEHIND = 2;

/** Start compact, then expand to the actual loaded guide horizon. */
const MIN_WINDOW_HOURS = 30;
const MAX_WINDOW_HOURS = 24 * 14;

/** Where the now line sits when the guide jumps to it. */
const NOW_INSET = 160;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// ── Page ──────────────────────────────────────────────────────

export function Epg() {
  const { t, number, date, time } = useI18n();
  const credentials = useAuthStore(selectPrimaryXtreamCredentials);
  const sources = useEnabledSources();
  const playStream = usePlayerStore((state) => state.playStream);
  const navigate = useNavigate();

  const [activeCategoryId, setActiveCategoryId] = useCatalogCategorySelection('live');
  const zoomPercent = useSettingsStore((state) => state.epgZoomPercent ?? DEFAULT_ZOOM_PERCENT);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const customTitleRules = useSettingsStore((state) => state.customTitleRules);
  const [selected, setSelected] = useState<{ channel: CatalogItem; programme: EpgProgramme } | null>(null);
  const [channelSearchQuery, setChannelSearchQuery] = useState('');

  const { data: allChannels = [], isLoading, isError, error, isFetching, refetch } = useLiveStreams();
  const {
    data: categories = [],
    isError: isCategoriesError,
    error: categoriesError,
    isFetching: areCategoriesFetching,
    refetch: refetchCategories,
  } = useCategories('live');
  const pageError = getCombinedErrorMessage([error, categoriesError], '');
  const showLoadError = (isError || isCategoriesError) && allChannels.length === 0;
  const errorPresentation = getErrorPresentation(pageError, 'TV Guide');
  const retryPage = () => {
    const retries = [
      ...(isError ? [refetch()] : []),
      ...(isCategoriesError ? [refetchCategories()] : []),
    ];
    void Promise.all(retries);
  };
  const hiddenCategoryIds = useHiddenCategoryIds('live');
  // Only downloads anything when XMLTV is the chosen source; see api/xmltv.ts.
  const { data: xmltv, isLoading: xmltvLoading } = useXmltvGuide();

  const channels = useMemo(() => {
    let list = filterItemsBySmartCategory(
      allChannels,
      activeCategoryId,
      hiddenCategoryIds,
      [],
      categories,
    );
    if (channelSearchQuery.trim()) {
      const q = channelSearchQuery.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    return list;
  }, [allChannels, activeCategoryId, hiddenCategoryIds, categories, channelSearchQuery]);

  useEffect(() => {
    if (selected && !channels.some((channel) => channel.id === selected.channel.id)) {
      setSelected(null);
    }
  }, [channels, selected]);

  const selectCategory = useCallback((categoryId: string | null) => {
    setActiveCategoryId(categoryId);
    setSelected(null);
  }, [setActiveCategoryId]);

  // Ticks the now line and live-programme highlighting along. Half a minute is
  // finer than any programme boundary and costs one render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Anchored once, on purpose: recomputing it as time passes would slide every
  // programme sideways under the pointer. The now line moves instead, which is
  // what a guide is supposed to do.
  const [windowStart] = useState(() => {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    return start.getTime() - HOURS_BEHIND * HOUR;
  });
  const [providerWindowEnd, setProviderWindowEnd] = useState(windowStart);
  const maximumWindowEnd = windowStart + MAX_WINDOW_HOURS * HOUR;
  const xmltvWindowEnd = useMemo(() => {
    if (!xmltv) return windowStart;
    let latest = windowStart;
    for (const programmes of xmltv.byChannel.values()) {
      for (const programme of programmes) latest = Math.max(latest, programme.end);
    }
    return latest;
  }, [windowStart, xmltv]);
  const windowEnd = Math.min(
    maximumWindowEnd,
    Math.max(windowStart + MIN_WINDOW_HOURS * HOUR, xmltvWindowEnd, providerWindowEnd),
  );
  const reportProgrammeEnd = useCallback((end: number) => {
    if (!Number.isFinite(end)) return;
    setProviderWindowEnd((current) => Math.max(current, Math.min(end, maximumWindowEnd)));
  }, [maximumWindowEnd]);

  const pixelsPerMinute = BASE_PIXELS_PER_MINUTE * (zoomPercent / 100);
  const timelineWidth = ((windowEnd - windowStart) / MINUTE) * pixelsPerMinute;
  const offsetOf = useCallback(
    (time: number) => ((time - windowStart) / MINUTE) * pixelsPerMinute,
    [windowStart, pixelsPerMinute]
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [timelineViewport, setTimelineViewport] = useState({ scrollLeft: 0, width: 0 });

  const rows = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
    isScrollingResetDelay: 100,
  });

  const jumpToNow = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollerRef.current?.scrollTo({
      left: epgNowScrollLeft(Date.now(), windowStart, pixelsPerMinute, NOW_INSET),
      behavior,
    });
  }, [pixelsPerMinute, windowStart]);

  const shiftTimeline = useCallback((minutes: number) => {
    scrollerRef.current?.scrollBy({ left: minutes * pixelsPerMinute, behavior: 'smooth' });
  }, [pixelsPerMinute]);

  const syncHorizontalClip = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    scroller.style.setProperty('--timeline-scroll-left', `${scroller.scrollLeft}px`);
    setTimelineViewport((current) => (
      current.scrollLeft === scroller.scrollLeft && current.width === scroller.clientWidth
        ? current
        : { scrollLeft: scroller.scrollLeft, width: scroller.clientWidth }
    ));
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => setTimelineViewport({ scrollLeft: scroller.scrollLeft, width: scroller.clientWidth });
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // On arrival the guide should already be showing what is on, not the small
  // hours of the morning. Layout effect so it never paints at the far left first.
  const landed = useRef(false);
  useLayoutEffect(() => {
    if (landed.current || channels.length === 0) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const align = () => {
      const left = epgNowScrollLeft(Date.now(), windowStart, pixelsPerMinute, NOW_INSET);
      scroller.scrollLeft = left;
      scroller.style.setProperty('--timeline-scroll-left', `${left}px`);
      setTimelineViewport({ scrollLeft: left, width: scroller.clientWidth });
    };
    // Set it before the first paint, then verify once the lazy route, sticky
    // column, and virtual canvas have completed their first layout.
    align();
    const frame = window.requestAnimationFrame(() => {
      align();
      landed.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [channels.length, pixelsPerMinute, windowStart]);

  // Zooming keeps whatever moment sits under the left edge in place, rather than
  // throwing the view to a different hour.
  const previousPixelsPerMinute = useRef(pixelsPerMinute);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || previousPixelsPerMinute.current === pixelsPerMinute) return;
    const ratio = pixelsPerMinute / previousPixelsPerMinute.current;
    previousPixelsPerMinute.current = pixelsPerMinute;
    scroller.scrollLeft *= ratio;
  }, [pixelsPerMinute]);

  const playChannel = useCallback(
    (channel: CatalogItem) => {
      const playable = playableFromMediaItem({ ...channel, type: 'live' }, credentials);
      if (playable) playStream(playable);
    },
    [credentials, playStream]
  );

  const playProgramme = useCallback((channel: CatalogItem, programme: EpgProgramme) => {
    const playable = playableFromMediaItem({ ...channel, type: 'live' }, credentials);
    if (!playable) return;
    let archiveUrl: string | null = null;
    if (channel.sourceId?.startsWith('m3u-')) {
      const entry = useSourceStore.getState().runtimes[channel.sourceId]?.playlist?.entries
        .find((candidate) => candidate.id === channel.sourceItemId || candidate.id === channel.id);
      archiveUrl = resolveM3uCatchupUrl(entry, programme, Date.now(), { requireEnded: true });
    } else if (channel.sourceItemId && channel.catchup === 'xtream') {
      const xtreamCredentials = channel.sourceId ? getXtreamCredentials(channel.sourceId) : credentials;
      archiveUrl = resolveXtreamCatchupUrl(
        { stream_id: Number(channel.sourceItemId), tv_archive: 1, tv_archive_duration: channel.catchupDays ?? 0 },
        xtreamCredentials,
        programme,
        { requireEnded: true },
      );
    }
    if (archiveUrl) {
      playStream({
        ...playable,
        type: 'vod',
        title: `${channel.title} · ${programme.title}`,
        streamUrl: archiveUrl,
        startPosition: 0,
        knownDuration: Math.max(0, (programme.end - programme.start) / 1000),
      });
      return;
    }
    playChannel(channel);
  }, [credentials, playChannel, playStream]);

  const hours = useMemo(() => {
    const marks: number[] = [];
    for (let time = windowStart; time < windowEnd; time += HOUR) marks.push(time);
    return marks;
  }, [windowStart, windowEnd]);

  return (
    <div className={`${appStyles.page} ${appStyles.catalogLayout}`}>
      <CategorySidebar
        type="live"
        activeCategoryId={activeCategoryId}
        onSelectCategory={selectCategory}
      />

      <div className={appStyles.catalogMain}>
        <CatalogPageHeader
          title="TV Guide"
          meta={isLoading ? t('Loading channels') : t('{count} channels', { count: number(channels.length) })}
        />

        {!sources.isAvailable ? (
          <EmptyState
            icon={Tv}
            title="No Source Available"
            description="Connect an Xtream account or add an M3U playlist to see the programme guide."
            actionLabel="Manage Sources"
            onAction={() => navigate('/settings?section=sources')}
          />
        ) : showLoadError ? (
          <ErrorState
            title={errorPresentation.title}
            description={errorPresentation.description}
            detail={errorPresentation.detail}
            actionLabel="Try Again"
            onAction={retryPage}
            isRetrying={(isError && isFetching) || (isCategoriesError && areCategoriesFetching)}
          />
        ) : !isLoading && channels.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No Channels Here"
            description="This category has no channels to build a guide from."
          />
        ) : (
          <div
            className={`${styles.guideWorkspace} ${appStyles.catalogInset}`}
            style={{ '--channel-width': `${CHANNEL_WIDTH}px` } as React.CSSProperties}
          >
            <div className={styles.guideToolbar}>
              <time className={styles.guideDate} dateTime={new Date(now).toISOString()}>
                {date(now, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </time>

              <div className={styles.timelineTools}>
                <div className={styles.timeNav} aria-label={t('Timeline navigation')}>
                  <button type="button" className={styles.timeShiftBtn} onClick={() => shiftTimeline(-60)} aria-label={t('One hour earlier')}>
                    <ChevronLeft size={15} />
                  </button>
                  <button type="button" className={styles.nowBtn} onClick={() => jumpToNow()} aria-label={t('Jump to current time')}>
                    <span>{t('Now')}</span>
                    <time dateTime={new Date(now).toISOString()}>
                      {time(now)}
                    </time>
                  </button>
                  <button type="button" className={styles.timeShiftBtn} onClick={() => shiftTimeline(60)} aria-label={t('One hour later')}>
                    <ChevronRight size={15} />
                  </button>
                </div>

                <div className={styles.zoomGroup} aria-label={t('Timeline zoom')}>
                  <Minus className={styles.zoomIcon} size={13} aria-hidden="true" />
                  <input
                    className={styles.zoomSlider}
                    type="range"
                    min={MIN_ZOOM_PERCENT}
                    max={MAX_ZOOM_PERCENT}
                    step={1}
                    value={zoomPercent}
                    aria-label={t('Timeline zoom')}
                    aria-valuetext={t('{percent} percent', { percent: number(zoomPercent) })}
                    style={{
                      '--zoom-progress': `${((zoomPercent - MIN_ZOOM_PERCENT) / (MAX_ZOOM_PERCENT - MIN_ZOOM_PERCENT)) * 100}%`,
                    } as React.CSSProperties}
                    onChange={(event) => updateSetting('epgZoomPercent', Number(event.target.value))}
                  />
                  <Plus className={styles.zoomIcon} size={13} aria-hidden="true" />
                  <span className={styles.zoomValue}>{number(zoomPercent)}%</span>
                </div>
              </div>
            </div>

            <div
              className={`${styles.scroller} subtle-scrollbar`}
              ref={scrollerRef}
              role="region"
              aria-label={t('TV Guide')}
              onScroll={syncHorizontalClip}
            >
              <div
                className={styles.canvas}
                style={{
                  width: CHANNEL_WIDTH + timelineWidth,
                  height: rows.getTotalSize() + RULER_HEIGHT,
                  '--ruler-height': `${RULER_HEIGHT}px`,
                } as React.CSSProperties}
              >
                <div className={styles.ruler}>
                  <div className={styles.rulerCorner}>
                    <input
                      type="text"
                      placeholder={t('Search...')}
                      className={`uiField ${styles.channelSearchInput}`}
                      data-size="sm"
                      value={channelSearchQuery}
                      onChange={(e) => setChannelSearchQuery(e.target.value)}
                      aria-label={t('Filter channels')}
                    />
                  </div>
                  {hours.map((hourTime) => (
                    <div
                      key={hourTime}
                      className={styles.hourMark}
                      style={{ left: CHANNEL_WIDTH + offsetOf(hourTime) }}
                    >
                      <span className={styles.hourLabel}>
                        {time(hourTime)}
                      </span>
                      {new Date(hourTime).getHours() === 0 && (
                        <span className={styles.dayLabel}>
                          {date(hourTime, { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Behind the rows so it reads as part of the grid, not on top of it. */}
                {hours.map((time) => (
                  <div
                    key={`line-${time}`}
                    className={styles.hourLine}
                    style={{ left: CHANNEL_WIDTH + offsetOf(time) }}
                  />
                ))}

                {rows.getVirtualItems().map((row) => {
                  const channel = channels[row.index];
                  if (!channel) return null;
                  return (
                    <EpgRow
                      key={channel.id}
                      channel={channel}
                      xmltv={xmltv}
                      xmltvLoading={xmltvLoading}
                      top={row.start + RULER_HEIGHT}
                      windowStart={windowStart}
                      windowEnd={windowEnd}
                      offsetOf={offsetOf}
                      now={now}
                      selectedId={selected?.programme.id ?? null}
                      selectedChannelId={selected?.channel.id ?? null}
                      alternate={row.index % 2 === 1}
                      onSelect={(programme) => setSelected({ channel, programme })}
                      onPlay={playChannel}
                      onProgrammeEnd={reportProgrammeEnd}
                      requestEnabled={!rows.isScrolling}
                      customTitleRules={customTitleRules}
                      timelineScrollLeft={timelineViewport.scrollLeft}
                      timelineViewportWidth={timelineViewport.width}
                    />
                  );
                })}

                {now >= windowStart && now <= windowEnd && (
                  <div className={styles.nowLine} style={{ left: CHANNEL_WIDTH + offsetOf(now) }}>
                    <span className={styles.nowDot} />
                  </div>
                )}
              </div>
            </div>
            <ProgrammeDetail
              selection={selected}
              now={now}
              onPlay={playProgramme}
              onClose={() => setSelected(null)}
              customTitleRules={customTitleRules}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── One channel's lane ────────────────────────────────────────

interface EpgRowProps {
  channel: CatalogItem;
  xmltv: XmltvGuide | undefined;
  xmltvLoading: boolean;
  top: number;
  windowStart: number;
  windowEnd: number;
  offsetOf: (time: number) => number;
  now: number;
  selectedId: string | null;
  selectedChannelId: string | null;
  alternate: boolean;
  onSelect: (programme: EpgProgramme) => void;
  onPlay: (channel: CatalogItem) => void;
  onProgrammeEnd: (end: number) => void;
  requestEnabled: boolean;
  customTitleRules: readonly CustomTitleRule[];
  timelineScrollLeft: number;
  timelineViewportWidth: number;
}

const EpgRow = memo(function EpgRow({
  channel, xmltv, xmltvLoading, top, windowStart, windowEnd, offsetOf, now, selectedId,
  selectedChannelId, alternate, onSelect, onPlay, onProgrammeEnd, requestEnabled, customTitleRules,
  timelineScrollLeft, timelineViewportWidth,
}: EpgRowProps) {
  const { t, time, number } = useI18n();

  // The XMLTV file, when there is one, already holds every channel — so this
  // row only asks the provider when the file has nothing for it. That keeps the
  // two sources from both being consulted for the same lane.
  const fromXmltv = useMemo(
    () => lookupXmltvChannel(xmltv, channel.epgChannelId, channel.title, channel.sourceId),
    [xmltv, channel.epgChannelId, channel.title, channel.sourceId]
  );

  const {
    data: fromProvider = [],
    isLoading: providerLoading,
    isError,
    error,
    isSuccess: providerResolved,
    canFetch: canFetchProvider,
  } = useChannelEpg(channel.sourceItemId || channel.id, requestEnabled && !fromXmltv?.length, channel.sourceId);

  const programmes = fromXmltv?.length ? fromXmltv : fromProvider;
  const isLoading = programmes.length === 0 && (
    providerLoading
    || xmltvLoading
    || (canFetchProvider && !providerResolved && !isError)
  );

  useEffect(() => {
    const latest = programmes.reduce((end, programme) => Math.max(end, programme.end), 0);
    if (latest > 0) onProgrammeEnd(latest);
  }, [onProgrammeEnd, programmes]);

  const visible = useMemo(
    () => programmes.filter((p) => p.end > windowStart && p.start < windowEnd),
    [programmes, windowStart, windowEnd]
  );

  const cleanChannelName = useMemo(
    () => parseLiveChannelTitle(channel.title, customTitleRules).cleanTitle,
    [channel.title, customTitleRules],
  );

  return (
    <div className={`${styles.row} ${alternate ? styles.rowAlternate : ''}`} style={{ top, height: ROW_HEIGHT }}>
      <button type="button"
        className={`${styles.channel} ${selectedChannelId === channel.id ? styles.channelSelected : ''}`}
        onClick={() => onPlay(channel)}
        title={cleanChannelName}
      >
        <EpgChannelLogo
          posterUrl={channel.posterUrl}
          channelKey={(channel.sourceItemId || channel.id).toString()}
          sourceId={channel.sourceId}
        />
        <span className={styles.channelText}>
          <span className={styles.channelName}>{cleanChannelName}</span>
          {channel.channelNum != null && (
            <span className={styles.channelNum}>{channel.channelNum}</span>
          )}
        </span>
        <span className={styles.channelPlay}>
          <Play size={14} />
        </span>
      </button>

      <div className={styles.lane}>
        {isLoading ? (
          <div className={styles.lanePlaceholder} />
        ) : visible.length === 0 ? (
          <div
            className={styles.laneEmptyRow}
            role="status"
            aria-label={t(isError ? 'Guide unavailable' : 'No guide data')}
          >{isError && <span>{getErrorMessage(error, 'Channel guide query failed without an error message.')}</span>}</div>
        ) : (
          visible.map((programme) => {
            // Clipped to the window so a programme that started yesterday still
            // begins at the left edge instead of dragging the lane out of shape.
            const from = Math.max(programme.start, windowStart);
            const to = Math.min(programme.end, windowEnd);
            const live = now >= programme.start && now < programme.end;
            const programmeLeft = offsetOf(from) + 2;
            const programmeWidth = Math.max(4, offsetOf(to) - offsetOf(from) - 4);
            const visibleStart = Math.max(programmeLeft, timelineScrollLeft);
            const visibleEnd = Math.min(
              programmeLeft + programmeWidth,
              timelineScrollLeft + Math.max(0, timelineViewportWidth - CHANNEL_WIDTH),
            );
            const isReachable = visibleEnd - visibleStart >= 24;
            const progress = live
              ? ((now - programme.start) / (programme.end - programme.start)) * 100
              : 0;
            const cleanProgTitle = cleanProgrammeTitle(
              programme.title,
              t('Programme information unavailable'),
              customTitleRules,
            );

            return (
              <button type="button"
                key={programme.id}
                className={[
                  styles.programme,
                  live ? styles.programmeLive : '',
                  now >= programme.end ? styles.programmePast : '',
                  selectedChannelId === channel.id && selectedId === programme.id ? styles.programmeSelected : '',
                ].join(' ')}
                style={{
                  left: programmeLeft,
                  width: programmeWidth,
                  '--programme-left': `${offsetOf(from)}px`,
                } as React.CSSProperties}
                disabled={!isReachable}
                aria-hidden={!isReachable || undefined}
                tabIndex={isReachable ? undefined : -1}
                onClick={() => onSelect(programme)}
                onDoubleClick={() => onPlay(channel)}
              >
                {live && <span className={styles.programmeProgress} style={{ width: `${progress}%` }} />}
                <span className={styles.programmeTitle}>{cleanProgTitle}</span>
                <span className={styles.programmeTime}>
                  {time(programme.start)} · {number(Math.round((programme.end - programme.start) / MINUTE))} min
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

// ── Detail panel ──────────────────────────────────────────────

interface ProgrammeDetailProps {
  selection: { channel: CatalogItem; programme: EpgProgramme } | null;
  now: number;
  onPlay: (channel: CatalogItem, programme: EpgProgramme) => void;
  onClose: () => void;
  customTitleRules: readonly CustomTitleRule[];
}

function ProgrammeDetail({ selection, now, onPlay, onClose, customTitleRules }: ProgrammeDetailProps) {
  const { t, time, number } = useI18n();
  if (!selection) {
    return (
      <aside className={`${styles.detail} ${styles.detailEmpty}`} aria-label={t('Programme details')}>
        <span className={styles.detailEmptyTitle}>{t('No programme selected')}</span>
        <span className={styles.detailEmptyHint}>{t('Select a programme in the guide to view its details.')}</span>
      </aside>
    );
  }

  const { channel, programme } = selection;
  const live = now >= programme.start && now < programme.end;
  const progress = live
    ? Math.max(0, Math.min(100, ((now - programme.start) / (programme.end - programme.start)) * 100))
    : 0;
  const cleanChannelName = parseLiveChannelTitle(channel.title, customTitleRules).cleanTitle;
  const cleanProgTitle = cleanProgrammeTitle(
    programme.title,
    t('Programme information unavailable'),
    customTitleRules,
  );
  const cleanDescription = cleanProviderDescription(programme.description);

  return (
    <aside className={styles.detail}>
      <div className={styles.detailBody}>
        <div className={styles.detailHead}>
          <span className={styles.detailChannel}>{cleanChannelName}</span>
        </div>
        <h2 className={styles.detailTitle}>{cleanProgTitle}</h2>
        <div className={styles.detailMeta}>
          {live && <span className={styles.detailLive}><i />{t('Live')}</span>}
          <span>{time(programme.start)}–{time(programme.end)}</span>
          <span>{number(Math.round((programme.end - programme.start) / MINUTE))} min</span>
        </div>
        {live && (
          <div className={styles.detailProgress} aria-label={t('{percent} percent complete', { percent: number(Math.round(progress)) })}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
        {cleanDescription && <p className={styles.detailText}>{cleanDescription}</p>}
      </div>

      <div className={styles.detailActions}>
        <button type="button" className={styles.watchBtn} onClick={() => onPlay(channel, programme)}>
          <Play size={15} />
          {t('Watch')}
        </button>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('Close details')}>
          <X size={16} />
        </button>
      </div>
    </aside>
  );
}

function cleanProgrammeTitle(
  title: string,
  fallback: string,
  customTitleRules?: readonly CustomTitleRule[],
): string {
  if (!title?.trim()) return fallback;
  const parsed = parseLiveChannelTitle(title, customTitleRules);
  return parsed.cleanTitle || fallback;
}
