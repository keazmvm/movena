import type { CatalogType } from '../store/useSettingsStore';
import type { EnabledSourcesSnapshot } from '../hooks/useEnabledSources';
import { catalogQueryOptions, isCatalogAvailable } from './useCatalog';
import { categoriesQueryOptions } from './useCategories';
import { queryClient } from './queryClient';
import { preloadRouteModule } from '../routes/routeModules';

const ROUTE_CATALOGS: Record<string, readonly CatalogType[]> = {
  '/': ['live', 'vod', 'series'],
  '/live': ['live'],
  '/epg': ['live'],
  '/movies': ['vod'],
  '/series': ['series'],
  '/search': ['live', 'vod', 'series'],
};

const ROUTES_WITH_CATEGORIES = new Set(['/', '/live', '/epg', '/movies', '/series']);

/** Warm data for a likely navigation without downloading the large XMLTV guide speculatively. */
export async function prefetchNavigationData(
  path: string,
  sources: EnabledSourcesSnapshot,
): Promise<void> {
  const types = (ROUTE_CATALOGS[path] ?? []).filter((type) => isCatalogAvailable(type, sources));
  await Promise.all([
    preloadRouteModule(path),
    ...types.flatMap((type) => [
      queryClient.prefetchQuery(catalogQueryOptions(type, sources)),
      ...(ROUTES_WITH_CATEGORIES.has(path)
        ? [queryClient.prefetchQuery(categoriesQueryOptions(type, sources))]
        : []),
    ]),
  ]);
}
