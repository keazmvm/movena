import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VerifiedStreamMetadata {
  width: number;
  height: number;
  fps?: number;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  isHdr?: boolean;
  verifiedAt: number;
}

export interface StreamVerificationState {
  verifiedStreams: Record<string, VerifiedStreamMetadata>;
  recordVerification: (streamKey: string, meta: Omit<VerifiedStreamMetadata, 'verifiedAt'>) => void;
  getVerification: (streamKey: string) => VerifiedStreamMetadata | null;
  clearVerifications: () => void;
}

const MAX_VERIFICATIONS = 500;
const MAX_VERIFICATION_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function normalizeVerifiedStreams(value: unknown, now = Date.now()): Record<string, VerifiedStreamMetadata> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).flatMap(([key, candidate]) => {
    if (!key || !candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const item = candidate as Partial<VerifiedStreamMetadata>;
    if (!Number.isFinite(item.width) || !Number.isFinite(item.height) || !Number.isFinite(item.verifiedAt)
      || (item.width as number) <= 0 || (item.height as number) <= 0
      || now - (item.verifiedAt as number) < 0 || now - (item.verifiedAt as number) > MAX_VERIFICATION_AGE_MS) return [];
    return [[key, {
      width: Math.floor(item.width as number),
      height: Math.floor(item.height as number),
      ...(Number.isFinite(item.fps) && (item.fps as number) > 0 ? { fps: item.fps as number } : {}),
      ...(typeof item.videoCodec === 'string' ? { videoCodec: item.videoCodec.slice(0, 80) } : {}),
      ...(typeof item.audioCodec === 'string' ? { audioCodec: item.audioCodec.slice(0, 80) } : {}),
      ...(Number.isFinite(item.audioChannels) && (item.audioChannels as number) > 0 ? { audioChannels: item.audioChannels as number } : {}),
      ...(typeof item.isHdr === 'boolean' ? { isHdr: item.isHdr } : {}),
      verifiedAt: item.verifiedAt as number,
    } satisfies VerifiedStreamMetadata] as const];
  }).sort((left, right) => right[1].verifiedAt - left[1].verifiedAt)
    .slice(0, MAX_VERIFICATIONS)
    .reduce<Record<string, VerifiedStreamMetadata>>((result, [key, item]) => {
      result[key] = item;
      return result;
    }, {});
}

export function formatVerifiedResolution(width: number, height: number, fps?: number): string {
  let label = '';
  if (width >= 3800 || height >= 2100) label = '4K';
  else if (width >= 1900 || height >= 1000) label = '1080p';
  else if (width >= 1200 || height >= 700) label = '720p';
  else if (height > 0) label = `${height}p`;

  if (fps && fps >= 45) {
    label += `${Math.round(fps)}fps`;
  }
  return label;
}

export const useStreamVerificationStore = create<StreamVerificationState>()(
  persist(
    (set, get) => ({
      verifiedStreams: {},

      recordVerification: (streamKey, meta) => {
        if (!streamKey || !Number.isFinite(meta.width) || !Number.isFinite(meta.height) || meta.width <= 0 || meta.height <= 0) return;
        set((state) => ({
          verifiedStreams: normalizeVerifiedStreams({
            ...state.verifiedStreams,
            [streamKey]: {
              ...meta,
              verifiedAt: Date.now(),
            },
          }),
        }));
      },

      getVerification: (streamKey) => {
        if (!streamKey) return null;
        return get().verifiedStreams[streamKey] ?? null;
      },

      clearVerifications: () => {
        set({ verifiedStreams: {} });
      },
    }),
    {
      name: 'movena-stream-verification',
      version: 1,
      merge: (persisted, current) => ({
        ...current,
        verifiedStreams: normalizeVerifiedStreams((persisted as Partial<StreamVerificationState> | undefined)?.verifiedStreams),
      }),
      partialize: (state) => ({ verifiedStreams: normalizeVerifiedStreams(state.verifiedStreams) }),
    },
  ),
);
