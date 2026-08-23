import { getChannelEPG, getLiveStreams } from './xc';
import type { XCCredentials } from '../store/useAuthStore';
import { isTauri } from '@tauri-apps/api/core';
import { tauriApi } from './ipc';

/**
 * Work out where the programme guide should come from, without asking the user
 * to know anything.
 *
 * The order matters. The account's own listings are tried first: they need no
 * configuration, cost one small request per channel actually on screen, and are
 * what most providers ship. Only when those come back empty is it worth going
 * looking for an XMLTV file — and Xtream servers publish one at a predictable
 * address, so the URL can usually be filled in rather than typed.
 */

export type EpgDetectionKind = 'provider' | 'xmltv' | 'none';

export interface EpgDetection {
  kind: EpgDetectionKind;
  /** Shown to the user as-is. */
  message: string;
  /** Present when an XMLTV file was found; ready to be saved as the source. */
  url?: string;
}

/** How many channels to sample before concluding the provider has no guide. */
const SAMPLE_SIZE = 4;

export async function detectEpgSource(credentials: XCCredentials): Promise<EpgDetection> {
  let channels;
  try {
    channels = await getLiveStreams(credentials);
  } catch {
    return { kind: 'none', message: 'Could not reach the provider to check for a guide.' };
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return { kind: 'none', message: 'The provider returned no channels to check.' };
  }

  // Spread the sample across the list rather than taking the first few: the
  // top of a channel list is often filler that carries no listings even when
  // the rest of the account does.
  const step = Math.max(1, Math.floor(channels.length / SAMPLE_SIZE));
  const sample = Array.from({ length: SAMPLE_SIZE }, (_, i) => channels[i * step]).filter(Boolean);

  const results = await Promise.all(
    sample.map(async (channel) => {
      try {
        return (await getChannelEPG(credentials, channel.stream_id)).length;
      } catch {
        return 0;
      }
    })
  );

  const withGuide = results.filter((count) => count > 0).length;
  if (withGuide > 0) {
    return {
      kind: 'provider',
      message: `Your provider supplies the guide — listings found on ${withGuide} of ${sample.length} sampled channels.`,
    };
  }

  const xmltvUrl = xtreamXmltvUrl(credentials);
  if (await looksLikeXmltv(xmltvUrl)) {
    return {
      kind: 'xmltv',
      message: 'Your provider has no per-channel listings, but it does publish an XMLTV file. Saved below.',
      url: xmltvUrl,
    };
  }

  return {
    kind: 'none',
    message: 'No guide found automatically. Enter an XMLTV URL below.',
  };
}

/** The address every Xtream Codes server serves its XMLTV file from. */
export function xtreamXmltvUrl(credentials: XCCredentials): string {
  const base = credentials.url.replace(/\/+$/, '');
  const user = encodeURIComponent(credentials.username);
  const pass = encodeURIComponent(credentials.password);
  return `${base}/xmltv.php?username=${user}&password=${pass}`;
}

/**
 * Whether a URL serves something that looks like a guide, judged from the first
 * chunk of the body.
 *
 * Deliberately does not download the file: an XMLTV export for a few thousand
 * channels is tens of megabytes, which is far too much to spend on a question
 * the opening bytes already answer.
 */
export async function looksLikeXmltv(url: string): Promise<boolean> {
  try {
    if (isTauri()) return tauriApi.xmltvProbe({ url });
    const response = await fetch(url);
    if (!response.ok) return false;

    const reader = response.body?.getReader();
    if (!reader) {
      const text = (await response.text()).slice(0, 512);
      return isGuideStart(new TextEncoder().encode(text));
    }

    const { value } = await reader.read();
    await reader.cancel();
    return !!value && isGuideStart(value);
  } catch {
    return false;
  }
}

function isGuideStart(bytes: Uint8Array): boolean {
  // A gzip member: the file is compressed, and only a guide would be served
  // from a guide URL.
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return true;
  const head = new TextDecoder('utf-8').decode(bytes.slice(0, 512)).toLowerCase();
  return head.includes('<tv') || head.includes('<?xml');
}
