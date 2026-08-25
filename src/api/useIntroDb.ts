import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSettingsStore } from '../store/useSettingsStore';
import { getTmdbTvExternalIds, searchTmdb } from './tmdb';
import { searchTvmazeShows } from './tvmaze';
import { fetchIntroDbSegments, type IntroDbSegments } from './introdb';
import { queryKeys } from './queryKeys';
import { parseMediaDisplayTitle } from '../utils/titleParser';

const INTRODB_STALE_TIME = 1000 * 60 * 60 * 24; // 24 hours
const INTRODB_GC_TIME = 1000 * 60 * 60 * 24 * 7; // 7 days

const EMPTY_SEGMENTS: IntroDbSegments = {
  intro: null,
  recap: null,
  outro: null,
};

function parsePositiveInteger(value: string | number | undefined | null): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Fetch crowdsourced intro/recap/outro timestamps from IntroDB.
 *
 * Resolves the show's IMDB ID via TMDB or public TVmaze search before
 * querying IntroDB. Intermediate resolution steps are cached independently.
 */
export function useIntroDbSegments(
  seriesTitle?: string | null,
  seasonNum?: string | number | null,
  episodeNum?: string | number | null,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const tmdbApiKey = useSettingsStore((s) => s.tmdbApiKey);
  const tmdbEnabled = useSettingsStore((s) => s.tmdbEnabled);
  const introDbEnabled = useSettingsStore((s) => s.introDbEnabled);

  const cleanTitle = (
    seriesTitle
      ? (parseMediaDisplayTitle(seriesTitle)?.cleanTitle || seriesTitle).trim()
      : ''
  );
  const season = parsePositiveInteger(seasonNum);
  const episode = parsePositiveInteger(episodeNum);

  const isEligible = (
    enabled &&
    introDbEnabled &&
    Boolean(cleanTitle) &&
    season !== null &&
    episode !== null
  );

  return useQuery<IntroDbSegments>({
    queryKey: ['introdb_pipeline', cleanTitle.toLowerCase(), season, episode],
    queryFn: async ({ signal }) => {
      if (!isEligible || season === null || episode === null) {
        return EMPTY_SEGMENTS;
      }

      let imdbId: string | null = null;
      const apiKey = tmdbApiKey.trim();

      // Strategy 1: TMDB External IDs (if configured and enabled)
      if (tmdbEnabled && apiKey) {
        try {
          const searchResult = await queryClient.ensureQueryData({
            queryKey: queryKeys.tmdbSearch('tv', cleanTitle, 'en', false),
            queryFn: ({ signal: searchSignal }) => searchTmdb(apiKey, cleanTitle, searchSignal),
            staleTime: INTRODB_STALE_TIME,
            gcTime: INTRODB_GC_TIME,
          });

          const tvMatch = searchResult.results.find((r) => r.mediaType === 'tv');
          if (tvMatch?.id) {
            const externalIds = await queryClient.ensureQueryData({
              queryKey: queryKeys.tmdbExternalIds(tvMatch.id),
              queryFn: ({ signal: extSignal }) => getTmdbTvExternalIds(apiKey, tvMatch.id, extSignal),
              staleTime: INTRODB_STALE_TIME,
              gcTime: INTRODB_GC_TIME,
            });
            if (externalIds.imdbId) {
              imdbId = externalIds.imdbId;
            }
          }
        } catch {
          // Fallback to TVmaze below
        }
      }

      // Strategy 2: TVmaze lookup (free, zero API key required)
      if (!imdbId) {
        try {
          const tvmazeShows = await queryClient.ensureQueryData({
            queryKey: queryKeys.tvmazeSearch(cleanTitle),
            queryFn: ({ signal: searchSignal }) => searchTvmazeShows(cleanTitle, searchSignal),
            staleTime: INTRODB_STALE_TIME,
            gcTime: INTRODB_GC_TIME,
          });

          const match = tvmazeShows.find((s) => s.externals.imdb);
          if (match?.externals.imdb) {
            imdbId = match.externals.imdb;
          }
        } catch {
          // No match found
        }
      }

      if (!imdbId) {
        return EMPTY_SEGMENTS;
      }

      // Strategy 3: Query IntroDB with the resolved IMDb ID
      return queryClient.ensureQueryData({
        queryKey: queryKeys.introDbSegments(imdbId, season, episode),
        queryFn: ({ signal: segSignal }) => fetchIntroDbSegments(imdbId!, season, episode, segSignal ?? signal),
        staleTime: INTRODB_STALE_TIME,
        gcTime: INTRODB_GC_TIME,
      });
    },
    enabled: isEligible,
    staleTime: INTRODB_STALE_TIME,
    gcTime: INTRODB_GC_TIME,
    retry: false,
  });
}
