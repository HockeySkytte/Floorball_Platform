"use client";

import { useMemo } from "react";
import type { VideoClipPause } from "@/components/video/types";
import { buildClipMapping } from "@/components/video/clipTimelineMath";
import { fmtClock } from "@/components/video/time";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export default function Timeline({
  clipStart,
  clipEnd,
  currentClipSec,
  pauses,
  onSeekClip,
}: {
  clipStart: number;
  clipEnd: number;
  currentClipSec: number;
  pauses: VideoClipPause[];
  onSeekClip: (clipSec: number) => void;
}) {
  const mapping = useMemo(() => buildClipMapping({ clipStart, clipEnd, pauses }), [clipStart, clipEnd, pauses]);
  const len = mapping.totalLen;

  const playheadX = clamp01(currentClipSec / len);

  const segments = useMemo(() => {
    const segs: Array<
      | { kind: "play"; clipFrom: number; clipTo: number }
      | { kind: "pause"; clipFrom: number; clipTo: number; pauseId: string; durationSec: number }
    > = [];

    let clipCursor = 0;
    let absCursor = clipStart;
    for (const p of mapping.pauses) {
      const playLen = Math.max(0, p.atSec - absCursor);
      if (playLen > 0) {
        segs.push({ kind: "play", clipFrom: clipCursor, clipTo: clipCursor + playLen });
        clipCursor += playLen;
        absCursor = p.atSec;
      }

      const pauseLen = Math.max(0, p.durationSec);
      if (pauseLen > 0) {
        segs.push({ kind: "pause", clipFrom: clipCursor, clipTo: clipCursor + pauseLen, pauseId: p.id, durationSec: pauseLen });
        clipCursor += pauseLen;
      }
    }

    const tail = Math.max(0, clipEnd - absCursor);
    if (tail > 0) segs.push({ kind: "play", clipFrom: clipCursor, clipTo: clipCursor + tail });
    return segs;
  }, [clipStart, clipEnd, mapping.pauses]);

  const ticks = useMemo(() => {
    const approx = 8;
    const step = Math.max(5, Math.round(len / approx / 5) * 5);
    const list: { t: number; x: number; label: string }[] = [];
    for (let t = 0; t <= len + 1e-9; t += step) {
      list.push({ t, x: clamp01(t / len), label: fmtClock(t) });
    }
    return list;
  }, [len]);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between text-xs text-zinc-700">
        <div>
          Klip: <span className="font-semibold">{fmtClock(0)}</span> →{" "}
          <span className="font-semibold">{fmtClock(len)}</span>
        </div>
        <div>
          Playhead: <span className="font-semibold">{fmtClock(currentClipSec)}</span>
        </div>
      </div>

      <div
        className="relative mt-2 h-10 cursor-pointer rounded-md bg-zinc-100"
        onMouseDown={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const x = clamp01((e.clientX - r.left) / Math.max(1, r.width));
          onSeekClip(x * len);
        }}
      >
        {/* Clip segment */}
        <div className="absolute inset-y-0 left-0 right-0 rounded-md bg-zinc-200" />

        {segments.map((s, idx) => {
          const x = clamp01(s.clipFrom / len);
          const w = clamp01((s.clipTo - s.clipFrom) / len);
          if (s.kind === "pause") {
            return (
              <div
                key={s.pauseId}
                className="absolute inset-y-0 rounded bg-purple-300/70"
                style={{ left: `${x * 100}%`, width: `${Math.max(0.4, w * 100)}%` }}
                title={`Pause ${s.durationSec}s`}
              />
            );
          }
          // play segment: leave as background
          return <div key={idx} />;
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-zinc-900"
          style={{ left: `${playheadX * 100}%` }}
        />

        {/* Tick labels */}
        <div className="absolute -bottom-5 left-0 right-0 text-[10px] text-zinc-600">
          {ticks.map((t) => (
            <div
              key={t.t}
              className="absolute"
              style={{ left: `${t.x * 100}%`, transform: "translateX(-50%)" }}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
