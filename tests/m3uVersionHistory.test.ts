import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearM3uVersions,
  deleteM3uVersion,
  listM3uVersions,
  resetM3uVersionMemoryForTests,
  saveM3uVersion,
} from '../src/services/m3uVersionHistory';

beforeEach(() => {
  vi.stubGlobal('indexedDB', undefined);
  resetM3uVersionMemoryForTests();
});

describe('M3U version history', () => {
  it('keeps source histories isolated and bounded', async () => {
    for (let index = 0; index < 12; index += 1) {
      await saveM3uVersion({ sourceId: 'one', content: `version-${index}`, entryCount: index, label: 'Checkpoint' });
    }
    await saveM3uVersion({ sourceId: 'two', content: 'other', entryCount: 1, label: 'Other' });

    const first = await listM3uVersions('one');
    expect(first).toHaveLength(10);
    expect(first.every((version) => version.sourceId === 'one')).toBe(true);
    expect(await listM3uVersions('two')).toHaveLength(1);
  });

  it('deletes individual versions and clears a source', async () => {
    const version = await saveM3uVersion({ sourceId: 'one', content: 'playlist', entryCount: 1, label: 'Checkpoint' });
    await deleteM3uVersion(version.id);
    expect(await listM3uVersions('one')).toEqual([]);

    await saveM3uVersion({ sourceId: 'one', content: 'playlist', entryCount: 1, label: 'Checkpoint' });
    await clearM3uVersions('one');
    expect(await listM3uVersions('one')).toEqual([]);
  });
});
