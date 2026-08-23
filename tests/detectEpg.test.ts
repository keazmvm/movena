// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

const xc = vi.hoisted(() => ({ getLiveStreams: vi.fn(), getChannelEPG: vi.fn() }));
const tauri = vi.hoisted(() => ({ isTauri: vi.fn(() => false) }));
const ipc = vi.hoisted(() => ({ xmltvProbe: vi.fn() }));
vi.mock('../src/api/xc', () => xc);
vi.mock('@tauri-apps/api/core', () => tauri);
vi.mock('../src/api/ipc', () => ({ tauriApi: ipc }));

import { detectEpgSource, looksLikeXmltv, xtreamXmltvUrl } from '../src/api/detectEpg';

const credentials = {
  url: 'https://provider.test/', username: 'alice@example.com', password: 'p/a ss',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  tauri.isTauri.mockReturnValue(false);
});

describe('EPG source detection', () => {
  it('encodes the conventional Xtream XMLTV URL', () => {
    expect(xtreamXmltvUrl(credentials))
      .toBe('https://provider.test/xmltv.php?username=alice%40example.com&password=p%2Fa%20ss');
  });

  it('selects provider listings when any spread sample has guide data', async () => {
    xc.getLiveStreams.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({ stream_id: index })));
    xc.getChannelEPG.mockImplementation(async (_credentials, id) => id === 4 ? [{}] : []);

    await expect(detectEpgSource(credentials)).resolves.toMatchObject({ kind: 'provider' });
    expect(xc.getChannelEPG.mock.calls.map((call) => call[1])).toEqual([0, 2, 4, 6]);
  });

  it('reports unreachable and empty providers without probing XMLTV', async () => {
    xc.getLiveStreams.mockRejectedValueOnce(new Error('offline'));
    await expect(detectEpgSource(credentials)).resolves.toMatchObject({ kind: 'none', message: expect.stringContaining('Could not reach') });
    xc.getLiveStreams.mockResolvedValueOnce([]);
    await expect(detectEpgSource(credentials)).resolves.toMatchObject({ kind: 'none', message: expect.stringContaining('no channels') });
  });

  it('recognizes plain XML and gzip signatures from only the first body chunk', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('<?xml version="1.0"?><tv></tv>', { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([0x1f, 0x8b, 0x00]), { status: 200 }))
      .mockResolvedValueOnce(new Response('not a guide', { status: 200 })));

    await expect(looksLikeXmltv('https://guide.test/plain')).resolves.toBe(true);
    await expect(looksLikeXmltv('https://guide.test/gzip')).resolves.toBe(true);
    await expect(looksLikeXmltv('https://guide.test/text')).resolves.toBe(false);
  });

  it('uses the native probe in the desktop app so CORS cannot block detection', async () => {
    tauri.isTauri.mockReturnValue(true);
    ipc.xmltvProbe.mockResolvedValue(true);

    await expect(looksLikeXmltv('https://guide.test/native.xml')).resolves.toBe(true);
    expect(ipc.xmltvProbe).toHaveBeenCalledWith({ url: 'https://guide.test/native.xml' });
  });
});
