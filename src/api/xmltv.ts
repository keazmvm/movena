import { useQuery } from '@tanstack/react-query';
import { isTauri } from '@tauri-apps/api/core';
import { useSettingsStore } from '../store/useSettingsStore';
import type { EpgProgramme } from './useEpg';
import { useEnabledSources } from '../hooks/useEnabledSources';
import { getUrlQueryScope } from './queryKeys';
import { tauriApi } from './ipc';

/**
 * XMLTV as a guide source, for providers whose own listings are empty.
 *
 * This is the fallback, never the default. The provider's per-channel guide
 * costs one small request per visible row; an XMLTV file is the whole schedule
 * for every channel in one download, which for a few thousand channels runs to
 * tens of megabytes and has to be parsed in the webview before anything shows.
 * Worth it when there is nothing else, wasteful when there is.
 */

export interface XmltvGuide {
  /** Programmes per XMLTV channel id, each list sorted by start time. */
  byChannel: Map<string, EpgProgramme[]>;
  /** Display name (lower-cased) to channel id, for matching by name. */
  idByName: Map<string, string>;
  /** Preferred display name by channel id, used by editor matching tools. */
  nameById: Map<string, string>;
  channelCount: number;
  programmeCount: number;
}

/** `20260808203000 +0200`, with the offset optional per the XMLTV spec. */
const XMLTV_TIME = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?$/;

export function parseXmltvTime(value: string | null | undefined): number {
  if (!value) return 0;
  const match = XMLTV_TIME.exec(value.trim());
  if (!match) return 0;

  const [, year, month, day, hour, minute, second, offset] = match;
  const parts = [+year, +month - 1, +day, +hour, +minute, +(second ?? 0)] as const;

  const monthNumber = parts[1] + 1;
  const dayNumber = parts[2];
  const hourNumber = parts[3];
  const minuteNumber = parts[4];
  const secondNumber = parts[5];
  if (monthNumber < 1 || monthNumber > 12 || hourNumber > 23 || minuteNumber > 59 || secondNumber > 59) {
    return 0;
  }
  const daysInMonth = new Date(Date.UTC(parts[0], monthNumber, 0)).getUTCDate();
  if (dayNumber < 1 || dayNumber > daysInMonth) return 0;

  if (!offset) {
    // No offset means local time, which is what the Date constructor assumes.
    return new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]).getTime();
  }

  const sign = offset.startsWith('-') ? -1 : 1;
  const offsetHours = +offset.slice(1, 3);
  const offsetMinutesPart = +offset.slice(3, 5);
  if (offsetHours > 23 || offsetMinutesPart > 59) return 0;
  const offsetMinutes = sign * (offsetHours * 60 + offsetMinutesPart);
  return Date.UTC(...parts) - offsetMinutes * 60_000;
}

/**
 * Read the body as text, transparently handling a gzipped file.
 *
 * `xmltv.php` is usually served with `Content-Encoding: gzip`, which the fetch
 * layer unwraps on its own. A URL ending in `.gz` is a different matter: the
 * bytes themselves are compressed and arrive intact, so they have to be
 * inflated here.
 */
async function readGuideBody(response: Response): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!gzipped) return new TextDecoder('utf-8').decode(bytes);

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This guide uses gzip compression, which is not supported on this system.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export function parseXmltv(xml: string): XmltvGuide {
  const document = new DOMParser().parseFromString(xml, 'text/xml');
  if (document.querySelector('parsererror')) {
    throw new Error('This guide is not valid XML.');
  }

  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();

  for (const channel of Array.from(document.querySelectorAll('channel'))) {
    const id = channel.getAttribute('id');
    if (!id) continue;
    let preferredName = '';
    for (const name of Array.from(channel.querySelectorAll('display-name'))) {
      const displayName = name.textContent?.trim();
      const text = displayName?.toLowerCase();
      if (displayName && !preferredName) preferredName = displayName;
      if (text && !idByName.has(text)) idByName.set(text, id);
    }
    nameById.set(id, preferredName || id);
  }

  let programmeCount = 0;
  for (const node of Array.from(document.querySelectorAll('programme'))) {
    const channelId = node.getAttribute('channel');
    if (!channelId) continue;

    const start = parseXmltvTime(node.getAttribute('start'));
    const end = parseXmltvTime(node.getAttribute('stop'));
    if (!start || !end || end <= start) continue;

    const list = byChannel.get(channelId) ?? [];
    list.push({
      id: `${channelId}-${start}`,
      title: node.querySelector('title')?.textContent?.trim() || 'No title',
      description: node.querySelector('desc')?.textContent?.trim() || '',
      start,
      end,
    });
    byChannel.set(channelId, list);
    programmeCount += 1;
  }

  for (const list of byChannel.values()) list.sort((a, b) => a.start - b.start);

  return { byChannel, idByName, nameById, channelCount: byChannel.size, programmeCount };
}

export async function fetchXmltvGuide(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<XmltvGuide> {
  if (isTauri()) {
    const document = await tauriApi.xmltvFetch({ url, headers });
    const guide = parseXmltv(document.content);
    if (document.cacheKey) {
      await tauriApi.xmltvCacheCommit(document.cacheKey).catch(() => {});
    }
    return guide;
  }
  const response = await fetch(url, { signal, headers });
  if (!response.ok) throw new Error(`The guide URL answered HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
  return parseXmltv(await readGuideBody(response));
}

export function mergeXmltvGuides(
  guides: Array<{ sourceId: string; guide: XmltvGuide }>,
): XmltvGuide {
  const byChannel = new Map<string, EpgProgramme[]>();
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  let programmeCount = 0;

  for (const { sourceId, guide } of guides) {
    for (const [channelId, programmes] of guide.byChannel) {
      const scopedId = `${sourceId}::${channelId}`;
      byChannel.set(scopedId, programmes.map((programme) => ({
        ...programme,
        id: `${sourceId}::${programme.id}`,
      })));
      programmeCount += programmes.length;
    }
    for (const [name, channelId] of guide.idByName) {
      idByName.set(`${sourceId}::${name}`, `${sourceId}::${channelId}`);
    }
    for (const [channelId, name] of guide.nameById) {
      nameById.set(`${sourceId}::${channelId}`, name);
    }
  }

  return { byChannel, idByName, nameById, channelCount: byChannel.size, programmeCount };
}

/**
 * Guides for every enabled source, downloaded and parsed into one scoped index.
 *
 * A playlist's embedded guide wins; the configured XMLTV URL is used only as
 * the selected fallback. Identical requests are downloaded once and shared.
 */
export function useXmltvGuide(enabled = true) {
  const sourceSetting = useSettingsStore((state) => state.epgSource);
  const configuredUrl = useSettingsStore((state) => state.epgXmltvUrl);
  const sources = useEnabledSources();
  const fallbackUrl = sourceSetting === 'xmltv' ? configuredUrl.trim() : '';
  const descriptors = [
    ...sources.availableXtreamSources.flatMap((source) => (source.credentials?.epgUrl || fallbackUrl)
      ? [{ sourceId: source.id, url: source.credentials?.epgUrl || fallbackUrl, headers: undefined }]
      : []),
    ...sources.availableM3uSources.flatMap((source) => {
      const playlistUrl = source.runtime?.connection?.epgUrl
        || source.runtime?.playlist?.epgUrls[0]
        || fallbackUrl;
      return playlistUrl.trim()
        ? [{ sourceId: source.id, url: playlistUrl.trim(), headers: source.runtime?.connection?.headers }]
        : [];
    }),
  ];
  const descriptorScope = descriptors
    .map((descriptor) => `${descriptor.sourceId}:${getUrlQueryScope(descriptor.url)}`)
    .sort()
    .join('|');

  return useQuery({
    queryKey: ['xmltv_guides', sources.queryScope, descriptorScope],
    queryFn: async ({ signal }) => {
      const requests = new Map<string, {
        url: string;
        headers?: Record<string, string>;
        sourceIds: string[];
      }>();
      for (const descriptor of descriptors) {
        const headerKey = JSON.stringify(Object.entries(descriptor.headers ?? {}).sort());
        const key = `${descriptor.url}\n${headerKey}`;
        const request = requests.get(key);
        if (request) request.sourceIds.push(descriptor.sourceId);
        else requests.set(key, { url: descriptor.url, headers: descriptor.headers, sourceIds: [descriptor.sourceId] });
      }
      const results = await Promise.allSettled([...requests.values()].map(async (request) => ({
        request,
        guide: await fetchXmltvGuide(request.url, signal, request.headers),
      })));
      const loaded = results.flatMap((result) => result.status === 'fulfilled'
        ? result.value.request.sourceIds.map((sourceId) => ({ sourceId, guide: result.value.guide }))
        : []);
      if (loaded.length === 0) {
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failure) throw failure.reason;
      }
      return mergeXmltvGuides(loaded);
    },
    enabled: enabled && descriptors.length > 0,
    // A schedule is worth re-downloading a couple of times a day, not hourly.
    staleTime: 1000 * 60 * 60 * 6,
    gcTime: 1000 * 60 * 60 * 12,
    retry: false,
  });
}

/**
 * Find a channel's listings in an XMLTV guide.
 *
 * Providers rarely agree with the guide file on channel ids, so the name is
 * tried as well before giving up.
 */
export function lookupXmltvChannel(
  guide: XmltvGuide | undefined,
  epgChannelId: string | undefined,
  title: string,
  sourceId?: string,
): EpgProgramme[] | undefined {
  if (!guide) return undefined;
  if (epgChannelId) {
    const scoped = sourceId ? guide.byChannel.get(`${sourceId}::${epgChannelId}`) : undefined;
    if (scoped?.length) return scoped;
    const direct = guide.byChannel.get(epgChannelId);
    if (direct?.length) return direct;
  }
  const normalizedTitle = title.trim().toLowerCase();
  const byName = (sourceId ? guide.idByName.get(`${sourceId}::${normalizedTitle}`) : undefined)
    || guide.idByName.get(normalizedTitle);
  return byName ? guide.byChannel.get(byName) : undefined;
}
