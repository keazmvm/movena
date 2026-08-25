import { desktopApi } from '../api/desktop';
import { tauriApi, type M3uDocument } from '../api/ipc';

export interface M3uConnectionSecret {
  location: string;
  epgUrl?: string | undefined;
  headers?: Record<string, string> | undefined;
}

const browserSecrets = new Map<string, string>();
const browserCache = new Map<string, M3uDocument>();

export async function storeM3uConnection(sourceId: string, secret: M3uConnectionSecret): Promise<void> {
  const value = JSON.stringify(secret);
  if (desktopApi.isDesktop()) await tauriApi.sourceSecretStore(sourceId, value);
  else browserSecrets.set(sourceId, value);
}

export async function loadM3uConnection(sourceId: string): Promise<M3uConnectionSecret | null> {
  const value = desktopApi.isDesktop()
    ? await tauriApi.sourceSecretLoad(sourceId)
    : browserSecrets.get(sourceId) ?? null;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<M3uConnectionSecret>;
    if (typeof parsed.location !== 'string' || !parsed.location) return null;
    const headers = parsed.headers && typeof parsed.headers === 'object' && !Array.isArray(parsed.headers)
      ? Object.fromEntries(Object.entries(parsed.headers).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ))
      : undefined;
    return {
      location: parsed.location,
      epgUrl: typeof parsed.epgUrl === 'string' && parsed.epgUrl ? parsed.epgUrl : undefined,
      headers,
    };
  } catch {
    return null;
  }
}

export async function deleteM3uConnection(sourceId: string): Promise<void> {
  if (desktopApi.isDesktop()) await tauriApi.sourceSecretDelete(sourceId);
  browserSecrets.delete(sourceId);
}

export async function fetchRemoteM3u(secret: M3uConnectionSecret, sourceId?: string): Promise<M3uDocument> {
  if (desktopApi.isDesktop()) {
    return tauriApi.m3uFetch({ url: secret.location, headers: secret.headers, cacheKey: sourceId });
  }
  const response = await fetch(secret.location, {
    ...(secret.headers ? { headers: secret.headers } : {}),
  });
  if (!response.ok) throw new Error(`The playlist URL answered HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
  return {
    content: await response.text(),
    baseUrl: response.url || secret.location,
  };
}

export async function readLocalM3u(path: string): Promise<M3uDocument> {
  if (!desktopApi.isDesktop()) throw new Error('Direct local-file refresh is available in the desktop app');
  return tauriApi.m3uReadFile(path);
}

export async function writeLocalM3u(path: string, content: string): Promise<void> {
  if (!desktopApi.isDesktop()) throw new Error('Direct local-file writing is available in the desktop app');
  await tauriApi.m3uWriteFile(path, content);
}

export async function storeM3uCache(sourceId: string, document: M3uDocument): Promise<void> {
  if (desktopApi.isDesktop()) await tauriApi.m3uCacheStore(sourceId, document);
  else browserCache.set(sourceId, document);
}

export async function loadM3uCache(sourceId: string): Promise<M3uDocument | null> {
  return desktopApi.isDesktop() ? tauriApi.m3uCacheLoad(sourceId) : browserCache.get(sourceId) ?? null;
}

export async function deleteM3uCache(sourceId: string): Promise<void> {
  if (desktopApi.isDesktop()) await tauriApi.m3uCacheDelete(sourceId);
  browserCache.delete(sourceId);
}
