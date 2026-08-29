import { useCallback } from 'react';
import { Tv } from 'lucide-react';
import type { MediaItem } from '../components/catalog/MediaCard';
import { CatalogPage } from '../components/catalog/CatalogPage';
import { selectPrimaryXtreamCredentials, useAuthStore } from '../store/useAuthStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { playableFromMediaItem } from '../utils/playback';

export function LiveTV() {
  const credentials = useAuthStore(selectPrimaryXtreamCredentials);
  const playStream = usePlayerStore((state) => state.playStream);

  const handlePlay = useCallback(
    (item: MediaItem) => {
      const playable = playableFromMediaItem({ ...item, type: 'live' }, credentials);
      if (playable) playStream(playable);
    },
    [credentials, playStream],
  );

  return (
    <CatalogPage
      type="live"
      title="Live TV"
      icon={Tv}
      emptyTitle="No Channels Found"
      emptyDescription="There are no live channels available in this category."
      noSourceDescription="Connect an Xtream account or add an M3U playlist in Settings to view live channels."
      onItemClick={handlePlay}
      isLiveTv
    />
  );
}
