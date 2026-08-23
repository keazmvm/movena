import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  credentialDelete: vi.fn(),
  credentialLoad: vi.fn(),
  credentialStore: vi.fn(),
  m3uCacheDelete: vi.fn(),
  m3uCacheLoad: vi.fn(),
  m3uCacheStore: vi.fn(),
  m3uFetch: vi.fn(),
  m3uReadFile: vi.fn(),
  sourceSecretDelete: vi.fn(),
  sourceSecretLoad: vi.fn(),
  sourceSecretStore: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: vi.fn(() => false) }));
vi.mock('../src/api/ipc', () => ({ tauriApi: native }));

import { isTauri } from '@tauri-apps/api/core';
import {
  deleteM3uCache,
  deleteM3uConnection,
  fetchRemoteM3u,
  loadM3uCache,
  loadM3uConnection,
  readLocalM3u,
  storeM3uCache,
  storeM3uConnection,
} from '../src/services/m3uRepository';
import {
  deleteXtreamCredentials,
  loadXtreamCredentials,
  storeXtreamCredentials,
} from '../src/services/xtreamRepository';
import {
  deleteProviderPassword,
  loadProviderPassword,
  storeProviderPassword,
} from '../src/services/credentialVault';

const isTauriMock = vi.mocked(isTauri);

beforeEach(() => {
  vi.clearAllMocks();
  isTauriMock.mockReturnValue(false);
  native.sourceSecretLoad.mockResolvedValue(null);
  native.m3uCacheLoad.mockResolvedValue(null);
  native.credentialLoad.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn());
});

describe('browser repository fallbacks', () => {
  it('stores and sanitizes M3U connection secrets in session memory only', async () => {
    await storeM3uConnection('m3u-test', {
      location: 'https://list.test/main.m3u',
      epgUrl: 'https://guide.test/epg.xml',
      headers: { Referer: 'https://portal.test', 'Bad-Value': 'kept' },
    });

    expect(await loadM3uConnection('m3u-test')).toEqual({
      location: 'https://list.test/main.m3u',
      epgUrl: 'https://guide.test/epg.xml',
      headers: { Referer: 'https://portal.test', 'Bad-Value': 'kept' },
    });
    expect(localStorage.length).toBe(0);

    await deleteM3uConnection('m3u-test');
    expect(await loadM3uConnection('m3u-test')).toBeNull();
  });

  it('fetches remote playlists and keeps browser cache isolated by source id', async () => {
    const fetchMock = vi.mocked(fetch).mockResolvedValue(new Response('#EXTM3U', {
      status: 200,
      headers: { 'content-type': 'audio/x-mpegurl' },
    }));
    await expect(fetchRemoteM3u({ location: 'https://list.test/a.m3u', headers: { Referer: 'portal' } }, 'm3u-a'))
      .resolves.toEqual({ content: '#EXTM3U', baseUrl: 'https://list.test/a.m3u' });
    expect(fetchMock).toHaveBeenCalledWith('https://list.test/a.m3u', { headers: { Referer: 'portal' } });

    await storeM3uCache('m3u-a', { content: 'A', baseUrl: 'https://a.test' });
    await storeM3uCache('m3u-b', { content: 'B', baseUrl: 'https://b.test' });
    expect(await loadM3uCache('m3u-a')).toMatchObject({ content: 'A' });
    expect(await loadM3uCache('m3u-b')).toMatchObject({ content: 'B' });

    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(fetchRemoteM3u({ location: 'https://list.test/offline.m3u' })).rejects.toThrow('answered HTTP 503');
    await expect(readLocalM3u('C:\\playlist.m3u')).rejects.toThrow('desktop app');
  });
});

describe('native credential and repository boundaries', () => {
  beforeEach(() => isTauriMock.mockReturnValue(true));

  it('routes M3U operations through typed native IPC', async () => {
    const document = { content: '#EXTM3U', baseUrl: 'https://list.test' };
    native.sourceSecretLoad.mockResolvedValue(JSON.stringify({
      location: 'https://list.test',
      headers: { Referer: 'ok', invalid: 42 },
    }));
    native.m3uCacheLoad.mockResolvedValue(document);
    native.m3uFetch.mockResolvedValue(document);
    native.m3uReadFile.mockResolvedValue({ ...document, fileName: 'playlist.m3u' });

    await storeM3uConnection('m3u-1', { location: 'https://list.test' });
    await expect(loadM3uConnection('m3u-1')).resolves.toMatchObject({ location: 'https://list.test' });
    await fetchRemoteM3u({ location: 'https://list.test' }, 'm3u-1');
    await readLocalM3u('C:\\playlist.m3u');
    await storeM3uCache('m3u-1', document);
    await loadM3uCache('m3u-1');
    await deleteM3uCache('m3u-1');
    await deleteM3uConnection('m3u-1');

    expect(native.sourceSecretStore).toHaveBeenCalledWith('m3u-1', JSON.stringify({ location: 'https://list.test' }));
    expect(native.m3uFetch).toHaveBeenCalledWith({ url: 'https://list.test', headers: undefined, cacheKey: 'm3u-1' });
    expect(native.m3uReadFile).toHaveBeenCalledWith('C:\\playlist.m3u');
    expect(native.m3uCacheStore).toHaveBeenCalledWith('m3u-1', document);
  });

  it('routes provider credentials and password storage through native IPC', async () => {
    const credentials = { sourceId: 'xtream-1', url: 'https://provider.test', username: 'alice', password: 'secret' };
    native.sourceSecretLoad.mockResolvedValue(JSON.stringify(credentials));
    native.credentialLoad.mockResolvedValue('secret');

    await storeXtreamCredentials('xtream-1', credentials);
    await expect(loadXtreamCredentials('xtream-1')).resolves.toMatchObject(credentials);
    await deleteXtreamCredentials('xtream-1');
    await storeProviderPassword('secret');
    await expect(loadProviderPassword()).resolves.toBe('secret');
    await deleteProviderPassword();

    expect(native.sourceSecretStore).toHaveBeenCalledWith('xtream-1', JSON.stringify(credentials));
    expect(native.sourceSecretDelete).toHaveBeenCalledWith('xtream-1');
    expect(native.credentialStore).toHaveBeenCalledWith('secret');
    expect(native.credentialDelete).toHaveBeenCalledTimes(1);
  });

  it('fails closed for malformed native secret documents', async () => {
    native.sourceSecretLoad.mockResolvedValue('{broken');
    await expect(loadM3uConnection('m3u-bad')).resolves.toBeNull();
    native.sourceSecretLoad.mockResolvedValue(JSON.stringify({ username: 'alice', password: 'secret' }));
    await expect(loadXtreamCredentials('xtream-bad')).resolves.toBeNull();
  });
});
