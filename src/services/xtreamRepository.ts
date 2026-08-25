import { tauriApi } from '../api/ipc';
import type { XCCredentials } from '../store/useAuthStore';

export async function storeXtreamCredentials(sourceId: string, credentials: XCCredentials): Promise<void> {
  await tauriApi.sourceSecretStore(sourceId, JSON.stringify(credentials));
}

export async function loadXtreamCredentials(sourceId: string): Promise<XCCredentials | null> {
  const value = await tauriApi.sourceSecretLoad(sourceId);
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
  await tauriApi.sourceSecretDelete(sourceId);
}
