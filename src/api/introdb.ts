/**
 * IntroDB API client — crowdsourced intro/recap/outro timestamps.
 *
 * Public read API, no API key required.
 * @see https://api.introdb.app
 */

const INTRODB_API = 'https://api.introdb.app';
const VALID_IMDB_ID = /^tt\d{7,8}$/;

// ── Types ────────────────────────────────────────────────────

interface IntroDbTimestamps {
  /** Segment start in seconds. */
  startSec: number;
  /** Segment end in seconds. */
  endSec: number;
}

export interface IntroDbSegments {
  intro: IntroDbTimestamps | null;
  recap: IntroDbTimestamps | null;
  outro: IntroDbTimestamps | null;
}

// ── Raw API shape ────────────────────────────────────────────

interface RawSegment {
  start_ms?: unknown;
  end_ms?: unknown;
  start_sec?: unknown;
  end_sec?: unknown;
  confidence?: unknown;
  submission_count?: unknown;
}

interface RawSegmentsResponse {
  imdb_id?: unknown;
  season?: unknown;
  episode?: unknown;
  intro?: RawSegment | null;
  recap?: RawSegment | null;
  outro?: RawSegment | null;
}

// ── Normalisation ────────────────────────────────────────────

/** Minimum confidence to accept a segment (keeps out low-quality community data). */
const MIN_CONFIDENCE = 0.5;

function normalizeSegment(raw: RawSegment | null | undefined): IntroDbTimestamps | null {
  if (!raw || typeof raw !== 'object') return null;

  // Prefer explicit seconds; fall back to milliseconds → seconds.
  let start: number | null = null;
  let end: number | null = null;

  if (typeof raw.start_sec === 'number' && Number.isFinite(raw.start_sec)) {
    start = raw.start_sec;
  } else if (typeof raw.start_ms === 'number' && Number.isFinite(raw.start_ms)) {
    start = raw.start_ms / 1000;
  }

  if (typeof raw.end_sec === 'number' && Number.isFinite(raw.end_sec)) {
    end = raw.end_sec;
  } else if (typeof raw.end_ms === 'number' && Number.isFinite(raw.end_ms)) {
    end = raw.end_ms / 1000;
  }

  if (start === null || end === null || start < 0 || end <= start) return null;

  // Gate on confidence when available.
  if (typeof raw.confidence === 'number' && raw.confidence < MIN_CONFIDENCE) return null;

  return { startSec: start, endSec: end };
}

function normalizeSegmentsResponse(data: unknown): IntroDbSegments {
  const empty: IntroDbSegments = { intro: null, recap: null, outro: null };
  if (!data || typeof data !== 'object') return empty;
  const raw = data as RawSegmentsResponse;
  return {
    intro: normalizeSegment(raw.intro),
    recap: normalizeSegment(raw.recap),
    outro: normalizeSegment(raw.outro),
  };
}

// ── Public API ───────────────────────────────────────────────

/**
 * Fetch intro/recap/outro timestamps for a single episode.
 *
 * Returns all-null segments on 404, network errors, or invalid input — never throws for
 * expected "no data" responses so callers can treat it as a simple cache miss.
 */
export async function fetchIntroDbSegments(
  imdbId: string,
  season: number,
  episode: number,
  signal?: AbortSignal,
): Promise<IntroDbSegments> {
  const empty: IntroDbSegments = { intro: null, recap: null, outro: null };

  if (!VALID_IMDB_ID.test(imdbId)) return empty;
  if (!Number.isInteger(season) || season < 1) return empty;
  if (!Number.isInteger(episode) || episode < 1) return empty;

  const url = `${INTRODB_API}/segments?imdb_id=${encodeURIComponent(imdbId)}&season=${season}&episode=${episode}`;

  try {
    const response = await fetch(url, {
      ...(signal ? { signal } : {}),
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return empty;
    return normalizeSegmentsResponse(await response.json());
  } catch {
    return empty;
  }
}
