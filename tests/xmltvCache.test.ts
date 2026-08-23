// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  xmltvFetch: vi.fn(),
  xmltvCacheCommit: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('../src/api/ipc', () => ({ tauriApi: native }));

import { fetchXmltvGuide } from '../src/api/xmltv';

const VALID_XML = `<?xml version="1.0"?>
<tv>
  <channel id="one"><display-name>One</display-name></channel>
  <programme channel="one" start="20260812120000 +0200" stop="20260812130000 +0200">
    <title>News</title>
  </programme>
</tv>`;

beforeEach(() => {
  vi.clearAllMocks();
  native.xmltvCacheCommit.mockResolvedValue(undefined);
});

describe('validated XMLTV disk caching', () => {
  it('commits a native download only after parsing succeeds', async () => {
    native.xmltvFetch.mockResolvedValue({ content: VALID_XML, cacheKey: '0123456789abcdef' });

    await expect(fetchXmltvGuide('https://guide.test/epg.xml')).resolves.toMatchObject({
      programmeCount: 1,
    });
    expect(native.xmltvCacheCommit).toHaveBeenCalledWith('0123456789abcdef');
  });

  it('does not commit malformed guide data', async () => {
    native.xmltvFetch.mockResolvedValue({
      content: '<tv><programme></tv>',
      cacheKey: '0123456789abcdef',
    });

    await expect(fetchXmltvGuide('https://guide.test/broken.xml')).rejects.toThrow('not valid XML');
    expect(native.xmltvCacheCommit).not.toHaveBeenCalled();
  });
});
