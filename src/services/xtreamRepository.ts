import { desktopApi } from '../api/desktop';
import { tauriApi } from '../api/ipc';
import type { XCCredentials } from '../store/useAuthStore';

const browserSecrets = new Map<string, string>();

export async function storeXtreamCredentials(sourceId: string, credentials: XCCredentials): Promise<void> {
  const value = JSON.stringify(credentials);
  if (desktopApi.isDesktop()) await tauriApi.sourceSecretStore(sourceId, value);
  else browserSecrets.set(sourceId, value);
}

export async function loadXtreamCredentials(sourceId: string): Promise<XCCredentials | null> {
  const value = desktopApi.isDesktop()
    ? await tauriApi.sourceSecretLoad(sourceId)
    : browserSecrets.get(sourceId) ?? null;
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<XCCredentials>;
    if (!parsed.url || !parsed.username || typeof parsed.password !== 'string') return null;
    return {
      sourceId: typeof parsed.sourceId === 'string' ? parsed.sourceId : sourceId,
      url: parsed.url,
      alternativeUrls: Array.isArray(parsed.alternativeUrls)
        ? parsed.alternativeUrls.filter((url): url is string => typeof url === 'string')
        : [],
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : undefined,
      epgUrl: typeof parsed.epgUrl === 'string' ? parsed.epgUrl : undefined,
      username: parsed.username,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

export async function deleteXtreamCredentials(sourceId: string): Promise<void> {
  if (desktopApi.isDesktop()) await tauriApi.sourceSecretDelete(sourceId);
  browserSecrets.delete(sourceId);
}
