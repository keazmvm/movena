import type { MediaItem } from '../components/catalog/MediaCard';
import { getStreamUrl, type XCEpisode } from '../api/xc';
import { getXtreamCredentials, resolveXtreamSourceId, type XCCredentials } from '../store/useAuthStore';
import type { PlayableStream } from '../store/usePlayerStore';
import { useSourceStore } from '../store/useSourceStore';

function cachedM3uTransport(id: string | number, sourceId: string | undefined) {
  if (!sourceId?.startsWith('m3u-')) return null;
  const entry = useSourceStore.getState().runtimes[sourceId]?.playlist?.entries
    .find((candidate) => candidate.id === String(id));
  return entry ? { streamUrl: entry.url, httpHeaders: entry.headers } : null;
}

/** Resolve a catalog/library item without making pages know which provider owns it. */
export function playableFromMediaItem(
  item: MediaItem,
  credentials: XCCredentials | null,
): PlayableStream | null {
  if (item.type !== 'live' && item.type !== 'vod') return null;
  const streamType = item.type;
  const providerId = item.sourceItemId || item.id;
  const resolvedSourceId = item.sourceId === 'xtream' ? resolveXtreamSourceId(item.sourceId) : item.sourceId;
  const cached = cachedM3uTransport(providerId, item.sourceId);
  const resolvedCredentials = resolvedSourceId
    ? (resolvedSourceId.startsWith('xtream-') ? getXtreamCredentials(resolvedSourceId) : null)
    : credentials || getXtreamCredentials();
  const streamUrl = item.streamUrl || cached?.streamUrl || (resolvedCredentials
    ? getStreamUrl(resolvedCredentials, item.type, providerId, item.containerExtension)
    : '');
  if (!streamUrl) return null;
  const alternativeFallbacks = resolvedCredentials
    ? (resolvedCredentials.alternativeUrls ?? []).map((url) => ({
        streamUrl: getStreamUrl({ ...resolvedCredentials, url }, streamType, providerId, item.containerExtension),
      }))
    : [];
  return {
    id: item.id,
    sourceItemId: providerId,
    title: item.title,
    type: item.type,
    streamUrl,
    httpHeaders: item.httpHeaders || cached?.httpHeaders,
    sourceId: resolvedSourceId,
    epgChannelId: item.epgChannelId,
    categoryId: item.categoryId,
    posterUrl: item.posterUrl,
    tags: item.tags,
    country: item.country,
    radio: item.radio,
    radioMetadata: item.radioMetadata,
    fallbacks: [
      ...(item.fallbacks ?? []),
      ...alternativeFallbacks,
      ...(item.streamUrl && cached?.streamUrl && cached.streamUrl !== item.streamUrl
        ? [{ streamUrl: cached.streamUrl, httpHeaders: cached.httpHeaders }]
        : []),
    ],
  };
}

export function resolveEpisodePlayback(
  episode: XCEpisode,
  credentials: XCCredentials | null,
): { streamUrl: string; httpHeaders?: Record<string, string> | undefined; sourceId?: string | undefined } | null {
  const cached = cachedM3uTransport(episode.id, episode.source_id);
  const resolvedCredentials = episode.source_id
    ? (episode.source_id.startsWith('xtream-') ? getXtreamCredentials(episode.source_id) : null)
    : credentials || getXtreamCredentials();
  const streamUrl = episode.stream_url || cached?.streamUrl || (resolvedCredentials
    ? getStreamUrl(resolvedCredentials, 'series', episode.id, episode.container_extension || 'mp4')
    : '');
  return streamUrl
    ? { streamUrl, httpHeaders: episode.http_headers || cached?.httpHeaders, sourceId: episode.source_id }
    : null;
}
