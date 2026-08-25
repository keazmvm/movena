import { useState, useCallback } from 'react';
import type { MediaItem, MediaOpenContext } from '../components/catalog/MediaCard';
import { useAuthStore, getLegacyXtreamSourceId } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSourceStore } from '../store/useSourceStore';
import { playableFromMediaItem } from '../utils/playback';

export interface UseMediaDetailStateOptions {
  enableSourceOnOpen?: boolean | undefined;
}

export function useMediaDetailState(options: UseMediaDetailStateOptions = {}) {
  const { enableSourceOnOpen = false } = options;
  const [selectedMovie, setSelectedMovie] = useState<MediaItem | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<MediaItem | null>(null);

  const credentials = useAuthStore((state) => state.credentials);
  const playStream = usePlayerStore((state) => state.playStream);

  const handleCloseMovie = useCallback(() => {
    setSelectedMovie(null);
  }, []);

  const handleCloseSeries = useCallback(() => {
    setSelectedSeries(null);
  }, []);

  const handleCloseAll = useCallback(() => {
    setSelectedMovie(null);
    setSelectedSeries(null);
  }, []);

  const handleItemClick = useCallback((item: MediaItem, context?: MediaOpenContext) => {
    if (enableSourceOnOpen) {
      const sourceId = item.sourceId && item.sourceId !== 'xtream'
        ? item.sourceId
        : (item.type === 'vod' || item.type === 'series' ? getLegacyXtreamSourceId() : undefined);
      if (sourceId) {
        useSourceStore.getState().setSourceEnabled(sourceId, true);
      }
    }

    if (item.type === 'series') {
      setSelectedMovie(null);
      setSelectedSeries(context ? {
        ...item,
        seasonNum: context.seasonNumber ?? item.seasonNum,
        episodeNum: context.episodeNumber ?? item.episodeNum,
      } : item);
    } else if (item.type === 'vod') {
      setSelectedSeries(null);
      setSelectedMovie(item);
    } else if (item.type === 'live') {
      setSelectedMovie(null);
      setSelectedSeries(null);
      const playable = playableFromMediaItem(item, credentials);
      if (playable) {
        playStream(playable);
      }
    }
  }, [credentials, enableSourceOnOpen, playStream]);

  return {
    selectedMovie,
    selectedSeries,
    setSelectedMovie,
    setSelectedSeries,
    handleCloseMovie,
    handleCloseSeries,
    handleCloseAll,
    handleItemClick,
  };
}
