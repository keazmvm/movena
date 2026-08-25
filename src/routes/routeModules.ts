import { lazy } from 'react';

const loaders = {
  '/': () => import('../pages/Home'),
  '/live': () => import('../pages/LiveTV'),
  '/epg': () => import('../pages/Epg'),
  '/movies': () => import('../pages/Movies'),
  '/series': () => import('../pages/Series'),
  '/search': () => import('../pages/Search'),
  '/continue': () => import('../pages/ContinueWatching'),
  '/favorites': () => import('../pages/Favorites'),
  '/collections': () => import('../pages/Collections'),
  '/downloads': () => import('../pages/Downloads'),
  '/upcoming': () => import('../pages/Upcoming'),
  '/settings': () => import('../pages/Settings'),
  '/m3u-editor': () => import('../pages/M3uEditorPage'),
} as const;

type PreloadableRoute = keyof typeof loaders;

export function preloadRouteModule(path: string): Promise<unknown> | undefined {
  const route = path.startsWith('/m3u-editor') ? '/m3u-editor' : path;
  return loaders[route as PreloadableRoute]?.();
}

export const Home = lazy(() => loaders['/']().then((module) => ({ default: module.Home })));
export const LiveTV = lazy(() => loaders['/live']().then((module) => ({ default: module.LiveTV })));
export const Epg = lazy(() => loaders['/epg']().then((module) => ({ default: module.Epg })));
export const Movies = lazy(() => loaders['/movies']().then((module) => ({ default: module.Movies })));
export const Series = lazy(() => loaders['/series']().then((module) => ({ default: module.Series })));
export const Search = lazy(() => loaders['/search']().then((module) => ({ default: module.Search })));
export const Favorites = lazy(() => loaders['/favorites']().then((module) => ({ default: module.Favorites })));
export const Collections = lazy(() => loaders['/collections']().then((module) => ({ default: module.Collections })));
export const ContinueWatching = lazy(() => loaders['/continue']().then((module) => ({ default: module.ContinueWatching })));
export const Downloads = lazy(() => loaders['/downloads']().then((module) => ({ default: module.Downloads })));
export const Upcoming = lazy(() => loaders['/upcoming']().then((module) => ({ default: module.Upcoming })));
export const Settings = lazy(() => loaders['/settings']().then((module) => ({ default: module.Settings })));
export const M3uEditorPage = lazy(() => loaders['/m3u-editor']().then((module) => ({ default: module.M3uEditorPage })));
