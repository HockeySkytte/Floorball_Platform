import type { VideoClipPause } from "@/components/video/types";

export type ClipMapping = {
  clipStart: number;
  clipEnd: number;
  pauses: VideoClipPause[];
  totalLen: number; // seconds incl. pauses
  absToClip: (absSec: number) => number; // 0..totalLen
  clipToAbs: (clipSec: number) => { absSec: number; inPause: boolean; pauseId: string | null };
  clipToAbsExcludingPause: (clipSec: number, pauseId: string) => { absSec: number; inPause: boolean; pauseId: string | null };
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function normalizePauses(pauses: VideoClipPause[], clipStart: number, clipEnd: number) {
  return pauses
    .filter((p) => Number.isFinite(p.atSec) && Number.isFinite(p.durationSec))
    .filter((p) => p.atSec >= clipStart - 1e-9 && p.atSec <= clipEnd + 1e-9)
    .map((p) => ({
      ...p,
      atSec: p.atSec,
      durationSec: Math.max(0, p.durationSec),
    }))
    .sort((a, b) => a.atSec - b.atSec || a.id.localeCompare(b.id));
}

function computeTotalLen(clipStart: number, clipEnd: number, pauses: VideoClipPause[]) {
  const base = Math.max(0.001, clipEnd - clipStart);
  const extra = pauses.reduce((sum, p) => sum + Math.max(0, p.durationSec), 0);
  return base + extra;
}

function makeClipToAbs(clipStart: number, clipEnd: number, pauses: VideoClipPause[]) {
  const baseLen = Math.max(0.001, clipEnd - clipStart);
  const totalLen = computeTotalLen(clipStart, clipEnd, pauses);

  return (clipSec: number) => {
    let remaining = clamp(clipSec, 0, totalLen);
    let abs = clipStart;

    for (const p of pauses) {
      const playLen = Math.max(0, p.atSec - abs);
      if (remaining <= playLen + 1e-9) {
        return { absSec: abs + remaining, inPause: false, pauseId: null };
      }

      remaining -= playLen;
      abs = p.atSec;

      const pauseLen = Math.max(0, p.durationSec);
      if (remaining <= pauseLen + 1e-9) {
        return { absSec: p.atSec, inPause: true, pauseId: p.id };
      }

      remaining -= pauseLen;
    }

    // after last pause
    const tail = Math.min(baseLen, remaining);
    return { absSec: clamp(abs + tail, clipStart, clipEnd), inPause: false, pauseId: null };
  };
}

function makeAbsToClip(clipStart: number, clipEnd: number, pauses: VideoClipPause[]) {
  const totalLen = computeTotalLen(clipStart, clipEnd, pauses);
  return (absSec: number) => {
    const abs = clamp(absSec, clipStart, clipEnd);
    let extra = 0;
    for (const p of pauses) {
      // If abs is exactly at the pause anchor, map to the START of the pause segment.
      // (During a pause, many clipSec values map to the same absSec.)
      if (p.atSec < abs - 1e-9) extra += Math.max(0, p.durationSec);
      else break;
    }
    return clamp(abs - clipStart + extra, 0, totalLen);
  };
}

export function buildClipMapping({
  clipStart,
  clipEnd,
  pauses,
}: {
  clipStart: number;
  clipEnd: number;
  pauses: VideoClipPause[];
}): ClipMapping {
  const normPauses = normalizePauses(pauses, clipStart, clipEnd);
  const totalLen = computeTotalLen(clipStart, clipEnd, normPauses);

  const absToClip = makeAbsToClip(clipStart, clipEnd, normPauses);
  const clipToAbs = makeClipToAbs(clipStart, clipEnd, normPauses);

  const clipToAbsExcludingPause = (clipSec: number, pauseId: string) => {
    const filtered = normPauses.filter((p) => p.id !== pauseId);
    return makeClipToAbs(clipStart, clipEnd, filtered)(clipSec);
  };

  return {
    clipStart,
    clipEnd,
    pauses: normPauses,
    totalLen,
    absToClip,
    clipToAbs,
    clipToAbsExcludingPause,
  };
}
