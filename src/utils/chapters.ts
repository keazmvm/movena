import type { MpvChapter } from '../store/usePlayerStore';

const INTRO_PATTERN = /^(op(ening)?|intro(duction)?|title\s*sequence)\b/i;
const OUTRO_PATTERN = /^(ed(ing)?|outro|ending|end\s*credits?|credits?)\b/i;

/**
 * The intro chapter, if the file has one, and where to land after it. Needs
 * a *following* chapter to know where the intro ends — a title alone only
 * marks where it starts, not how long it runs.
 */
export function findIntroChapter(
  chapters: MpvChapter[]
): { start: number; skipTo: number } | null {
  const index = chapters.findIndex((c) => c.title && INTRO_PATTERN.test(c.title.trim()));
  if (index === -1) return null;
  const next = chapters[index + 1];
  if (!next) return null;
  return { start: chapters[index].time, skipTo: next.time };
}

/**
 * The outro/credits chapter, if the file has one — used to show the "Next
 * Episode" prompt exactly when the credits start instead of guessing from a
 * fixed time offset.
 */
export function findOutroChapter(chapters: MpvChapter[]): { start: number } | null {
  const match = [...chapters].reverse().find((c) => c.title && OUTRO_PATTERN.test(c.title.trim()));
  return match ? { start: match.time } : null;
}
