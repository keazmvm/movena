/** Pure download-manager domain rules. No filesystem, network, or native IPC is used here. */

export const DOWNLOAD_JOB_STATES = [
  'queued',
  'downloading',
  'paused',
  'completed',
  'failed',
  'cancelled',
] as const;

export type DownloadJobState = (typeof DOWNLOAD_JOB_STATES)[number];

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  ratio: number | null;
  percent: number | null;
  indeterminate: boolean;
}

export interface DownloadJob {
  id: string;
  sourceUrl: string;
  headers?: Record<string, string> | undefined;
  filePath?: string | undefined;
  fileName: string;
  state: DownloadJobState;
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
  attempts: number;
  maxAttempts: number;
  error?: string | undefined;
  createdAt: number;
  updatedAt: number;
}

export interface DownloadStatusEvent {
  id: unknown;
  state: unknown;
  downloadedBytes?: unknown | undefined;
  totalBytes?: unknown | undefined;
  path?: unknown | undefined;
  error?: unknown | undefined;
}

export type DownloadJobAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'progress'; downloadedBytes: unknown; totalBytes?: unknown | undefined }
  | { type: 'complete'; totalBytes?: unknown | undefined }
  | { type: 'fail'; error: unknown }
  | { type: 'retry' }
  | { type: 'cancel'; reason?: unknown | undefined };

export interface CreateDownloadJobInput {
  id: unknown;
  sourceUrl: unknown;
  headers?: unknown | undefined;
  fileName?: unknown | undefined;
  maxAttempts?: unknown | undefined;
  totalBytes?: unknown | undefined;
  now?: unknown | undefined;
}

export interface FilenameOptions {
  fallback?: string | undefined;
  maxLength?: number | undefined;
}

const DEFAULT_FILE_NAME = 'download';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_FILENAME_LENGTH = 180;
const INVALID_FILENAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001F\u007F]/g;
const TRAILING_DOTS_AND_SPACES = /[. ]+$/g;
const WINDOWS_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([name, headerValue]) => name.length > 0 && name.length <= 128 && typeof headerValue === 'string' && headerValue.length <= 4096)
    .slice(0, 16)
    .map(([name, headerValue]) => [name, headerValue as string] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return value !== null
    && value !== undefined
    && typeof (value as { [Symbol.iterator]?: unknown | undefined })[Symbol.iterator] === 'function';
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(0, Math.floor(number));
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = finiteNumber(value);
  return number === null ? fallback : Math.max(1, Math.floor(number));
}

function safeTimestamp(value: unknown, fallback: number): number {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : fallback;
}

function safeError(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 500);
  if (value instanceof Error && value.message.trim()) return value.message.trim().slice(0, 500);
  if (isRecord(value) && typeof value.message === 'string' && value.message.trim()) {
    return value.message.trim().slice(0, 500);
  }
  return undefined;
}

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function splitFileName(fileName: string): { stem: string; extension: string } {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return { stem: fileName, extension: '' };
  return { stem: fileName.slice(0, lastDot), extension: fileName.slice(lastDot) };
}

function truncateFileName(fileName: string, maxLength: number): string {
  if (fileName.length <= maxLength) return fileName;
  const { stem, extension } = splitFileName(fileName);
  if (extension.length >= maxLength) return extension.slice(0, maxLength) || '_';
  const stemLength = Math.max(1, maxLength - extension.length);
  return `${stem.slice(0, stemLength)}${extension}`.replace(TRAILING_DOTS_AND_SPACES, '') || DEFAULT_FILE_NAME;
}

/** Converts arbitrary input into a portable, single-component filename. */
export function sanitizeDownloadFileName(value: unknown, options: FilenameOptions = {}): string {
  const fallback = typeof options.fallback === 'string' && options.fallback.trim()
    ? options.fallback.trim()
    : DEFAULT_FILE_NAME;
  const maxLength = positiveInteger(options.maxLength, DEFAULT_MAX_FILENAME_LENGTH);
  const raw = typeof value === 'string' ? value : '';
  let safe = raw
    .replace(INVALID_FILENAME_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(TRAILING_DOTS_AND_SPACES, '');

  if (!safe || safe === '.' || safe === '..') safe = fallback;
  if (WINDOWS_DEVICE_NAME.test(safe)) safe = `_${safe}`;

  safe = truncateFileName(safe, maxLength).replace(TRAILING_DOTS_AND_SPACES, '');
  return safe || DEFAULT_FILE_NAME;
}

function comparableFileName(value: unknown): string {
  return sanitizeDownloadFileName(value).normalize('NFKC').toLocaleLowerCase();
}

/**
 * Returns a sanitized name that does not collide with any supplied name.
 * Existing names are compared case-insensitively for cross-platform safety.
 */
export function createCollisionSafeFileName(
  desiredName: unknown,
  existingNames: Iterable<unknown> | unknown = [],
  options: FilenameOptions = {},
): string {
  const baseName = sanitizeDownloadFileName(desiredName, options);
  const occupied = new Set<string>();
  if (isIterable(existingNames)) {
    for (const existingName of existingNames) occupied.add(comparableFileName(existingName));
  }

  if (!occupied.has(comparableFileName(baseName))) return baseName;

  const { stem, extension } = splitFileName(baseName);
  for (let suffix = 1; suffix <= 100_000; suffix += 1) {
    const candidate = sanitizeDownloadFileName(`${stem} (${suffix})${extension}`, options);
    if (!occupied.has(comparableFileName(candidate))) return candidate;
  }

  return sanitizeDownloadFileName(`${stem}-${Date.now()}${extension}`, options);
}

/** Normalizes byte counts to a safe bounded progress value. */
export function normalizeDownloadProgress(downloadedBytes: unknown, totalBytes: unknown): DownloadProgress {
  const downloaded = nonNegativeInteger(downloadedBytes);
  const rawTotal = finiteNumber(totalBytes);
  const total = rawTotal !== null && rawTotal > 0 ? Math.floor(rawTotal) : null;

  if (total === null) {
    return {
      downloadedBytes: downloaded,
      totalBytes: null,
      ratio: null,
      percent: null,
      indeterminate: true,
    };
  }

  const boundedDownloaded = Math.min(downloaded, total);
  const ratio = clampRatio(boundedDownloaded / total);
  return {
    downloadedBytes: boundedDownloaded,
    totalBytes: total,
    ratio,
    percent: Math.round(ratio * 100),
    indeterminate: false,
  };
}

function isDownloadJobState(value: unknown): value is DownloadJobState {
  return typeof value === 'string' && (DOWNLOAD_JOB_STATES as readonly string[]).includes(value);
}

/**
 * Validates and repairs persisted job data. Invalid required identity fields return null;
 * optional counters, timestamps, names, and states are safely normalized.
 */
export function normalizeDownloadJob(input: unknown, now = Date.now()): DownloadJob | null {
  if (!isRecord(input)) return null;

  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  if (!id || !sourceUrl) return null;

  const safeNow = safeTimestamp(now, Date.now());
  const maxAttempts = positiveInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const attempts = Math.min(nonNegativeInteger(input.attempts), maxAttempts);
  const rawTotal = finiteNumber(input.totalBytes);
  const totalBytes = rawTotal !== null && rawTotal > 0 ? Math.floor(rawTotal) : null;
  const progress = normalizeDownloadProgress(input.downloadedBytes, totalBytes);
  const state = isDownloadJobState(input.state)
    ? input.state
    : (isDownloadJobState(input.status) ? input.status : 'queued');
  const createdAt = safeTimestamp(input.createdAt, safeNow);
  const updatedAt = safeTimestamp(input.updatedAt, createdAt);
  const error = safeError(input.error);

  return {
    id,
    sourceUrl,
    ...(safeHeaders(input.headers) ? { headers: safeHeaders(input.headers) } : {}),
    ...(typeof input.filePath === 'string' && input.filePath.trim() ? { filePath: input.filePath.trim() } : {}),
    fileName: sanitizeDownloadFileName(input.fileName),
    state,
    progress: state === 'completed' ? 1 : progress.ratio,
    downloadedBytes: state === 'completed' && totalBytes !== null ? totalBytes : progress.downloadedBytes,
    totalBytes,
    attempts,
    maxAttempts,
    ...(error ? { error } : {}),
    createdAt,
    updatedAt,
  };
}

/** Creates a queued job, or null when required input is malformed. */
export function createDownloadJob(input: CreateDownloadJobInput | unknown): DownloadJob | null {
  return normalizeDownloadJob({
    ...(isRecord(input) ? input : {}),
    state: 'queued',
    attempts: 0,
    downloadedBytes: 0,
    now: isRecord(input) ? input.now : undefined,
  }, isRecord(input) ? safeTimestamp(input.now, Date.now()) : Date.now());
}

function withUpdatedAt(job: DownloadJob, now: number): DownloadJob {
  return { ...job, updatedAt: safeTimestamp(now, job.updatedAt) };
}

function isAction(value: unknown): value is DownloadJobAction {
  return isRecord(value) && typeof value.type === 'string';
}

export function canTransitionDownloadJob(state: DownloadJobState, action: DownloadJobAction['type']): boolean {
  switch (action) {
    case 'start': return state === 'queued';
    case 'pause': return state === 'downloading';
    case 'resume': return state === 'paused';
    case 'progress': return state === 'downloading';
    case 'complete': return state === 'downloading';
    case 'fail': return state === 'downloading';
    case 'retry': return state === 'failed' || state === 'cancelled';
    case 'cancel': return state === 'queued' || state === 'downloading' || state === 'paused';
    default: return false;
  }
}

/** Applies only legal state transitions; malformed jobs/actions return null. */
export function transitionDownloadJob(
  inputJob: unknown,
  inputAction: unknown,
  now = Date.now(),
): DownloadJob | null {
  const job = normalizeDownloadJob(inputJob, now);
  if (!job || !isAction(inputAction) || !canTransitionDownloadJob(job.state, inputAction.type as DownloadJobAction['type'])) {
    return job;
  }

  const action = inputAction as DownloadJobAction;
  const updatedAt = safeTimestamp(now, job.updatedAt);

  switch (action.type) {
    case 'start':
      if (job.attempts >= job.maxAttempts) return job;
      return withUpdatedAt({ ...job, state: 'downloading', attempts: job.attempts + 1, error: undefined }, updatedAt);
    case 'pause':
      return withUpdatedAt({ ...job, state: 'paused' }, updatedAt);
    case 'resume':
      return withUpdatedAt({ ...job, state: 'downloading' }, updatedAt);
    case 'progress': {
      const progress = normalizeDownloadProgress(action.downloadedBytes, action.totalBytes ?? job.totalBytes);
      return withUpdatedAt({
        ...job,
        downloadedBytes: progress.downloadedBytes,
        totalBytes: progress.totalBytes,
        progress: progress.ratio,
        error: undefined,
      }, updatedAt);
    }
    case 'complete': {
      const progress = normalizeDownloadProgress(
        action.totalBytes ?? job.totalBytes ?? job.downloadedBytes,
        action.totalBytes ?? job.totalBytes,
      );
      return withUpdatedAt({
        ...job,
        state: 'completed',
        downloadedBytes: progress.totalBytes ?? progress.downloadedBytes,
        totalBytes: progress.totalBytes,
        progress: 1,
        error: undefined,
      }, updatedAt);
    }
    case 'fail':
      return withUpdatedAt({ ...job, state: 'failed', error: safeError(action.error) || 'Download failed' }, updatedAt);
    case 'retry':
      if (job.attempts >= job.maxAttempts) return job;
      return withUpdatedAt({
        ...job,
        state: 'queued',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: null,
        error: undefined,
      }, updatedAt);
    case 'cancel':
      return withUpdatedAt({ ...job, state: 'cancelled', error: safeError(action.reason) }, updatedAt);
    default:
      return job;
  }
}

export function updateDownloadProgress(
  job: DownloadJob,
  downloadedBytes: unknown,
  totalBytes?: unknown,
  now = Date.now(),
): DownloadJob | null {
  return transitionDownloadJob(job, {
    type: 'progress',
    downloadedBytes,
    totalBytes: totalBytes ?? job.totalBytes,
  }, now);
}

export function retryDownloadJob(job: DownloadJob, now = Date.now()): DownloadJob | null {
  return transitionDownloadJob(job, { type: 'retry' }, now);
}

export function cancelDownloadJob(job: DownloadJob, reason?: unknown, now = Date.now()): DownloadJob | null {
  return transitionDownloadJob(job, { type: 'cancel', reason }, now);
}
