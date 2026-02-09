"use client";

import { useMemo, useRef } from "react";
import type { VideoClipPause, VideoOverlay } from "@/components/video/types";
import { buildClipMapping } from "@/components/video/clipTimelineMath";
import { clamp, fmtClock } from "@/components/video/time";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

type DragState =
  | null
  | {
      kind: "clip-start" | "clip-end";
      startClientX: number;
      startAbsStart: number;
      startAbsEnd: number;
    }
  | {
      kind:
        | "pause-move"
        | "pause-resize-start"
        | "pause-resize-end"
        | "overlay-move"
        | "overlay-resize-start"
        | "overlay-resize-end";
      id: string;
      startClientX: number;
      startFrom: number;
      startTo: number;
    };

export default function TimelineEditor({
  clipStart,
  clipEnd,
  currentClipSec,
  pauses,
  setPauses,
  overlays,
  setOverlays,
  selectedOverlayId,
  setSelectedOverlayId,
  onSeekClip,
  setClipStart,
  setClipEnd,
  onBeginEdit,
  onEndEdit,
}: {
  clipStart: number;
  clipEnd: number;
  currentClipSec: number;
  pauses: VideoClipPause[];
  setPauses: (next: VideoClipPause[]) => void;
  overlays: VideoOverlay[];
  setOverlays: (next: VideoOverlay[]) => void;
  selectedOverlayId: string | null;
  setSelectedOverlayId: (id: string | null) => void;
  onSeekClip: (clipSec: number) => void;
  setClipStart: (absSec: number) => void;
  setClipEnd: (absSec: number) => void;
  onBeginEdit?: () => void;
  onEndEdit?: () => void;
}) {
  const mapping = useMemo(() => buildClipMapping({ clipStart, clipEnd, pauses }), [clipStart, clipEnd, pauses]);
  const len = mapping.totalLen;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState>(null);

  const pauseBars = useMemo(() => {
    return mapping.pauses.map((p) => {
      const from = mapping.absToClip(p.atSec);
      const to = from + Math.max(0, p.durationSec);
      return { id: p.id, from, to, durationSec: Math.max(0, p.durationSec) };
    });
  }, [mapping]);

  const overlayBars = useMemo(() => {
    return overlays
      .map((o) => {
        const from = mapping.absToClip(o.startSec);
        const to = mapping.absToClip(o.endSec);
        return { id: o.id, type: o.type, from: Math.min(from, to), to: Math.max(from, to) };
      })
      .sort((a, b) => a.from - b.from || a.id.localeCompare(b.id));
  }, [mapping, overlays]);

  function clipFromClientX(clientX: number) {
    const host = hostRef.current;
    if (!host) return 0;
    const r = host.getBoundingClientRect();
    const x = clamp01((clientX - r.left) / Math.max(1, r.width));
    return x * len;
  }

  function seekFromEvent(e: React.MouseEvent) {
    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const x = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    onSeekClip(x * len);
  }

  function beginDrag(e: React.PointerEvent, drag: DragState) {
    onBeginEdit?.();
    dragRef.current = drag;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;

    const host = hostRef.current;
    if (!host) return;
    const r = host.getBoundingClientRect();
    const baseLenAbs = Math.max(0.001, clipEnd - clipStart);
    const pxToAbs = baseLenAbs / Math.max(1, r.width);
    const pxToClip = len / Math.max(1, r.width);
    const deltaAbs = (e.clientX - drag.startClientX) * pxToAbs;
    const deltaClip = (e.clientX - drag.startClientX) * pxToClip;

    if (drag.kind === "clip-start") {
      const nextAbs = clamp(drag.startAbsStart + deltaAbs, 0, drag.startAbsEnd - 0.2);
      setClipStart(nextAbs);
      return;
    }

    if (drag.kind === "clip-end") {
      const nextAbs = Math.max(drag.startAbsStart + 0.2, drag.startAbsEnd + deltaAbs);
      setClipEnd(nextAbs);
      return;
    }

    if (!("startFrom" in drag) || !("startTo" in drag)) return;
    const barLen = Math.max(0.05, drag.startTo - drag.startFrom);

    if (drag.kind === "pause-move") {
      const nextFrom = clamp(drag.startFrom + deltaClip, 0, Math.max(0, len - barLen));
      const abs = mapping.clipToAbsExcludingPause(nextFrom, drag.id).absSec;
      setPauses(
        pauses.map((p) => (p.id === drag.id ? { ...p, atSec: clamp(abs, clipStart, clipEnd) } : p))
      );
      return;
    }

    if (drag.kind === "pause-resize-end") {
      const nextTo = clamp(drag.startTo + deltaClip, drag.startFrom, len);
      const nextDur = Math.max(0, nextTo - drag.startFrom);
      setPauses(pauses.map((p) => (p.id === drag.id ? { ...p, durationSec: nextDur } : p)));
      return;
    }

    if (drag.kind === "pause-resize-start") {
      const nextFrom = clamp(drag.startFrom + deltaClip, 0, drag.startTo);
      const abs = mapping.clipToAbsExcludingPause(nextFrom, drag.id).absSec;
      const nextDur = Math.max(0, drag.startTo - nextFrom);
      setPauses(
        pauses.map((p) =>
          p.id === drag.id
            ? {
                ...p,
                atSec: clamp(abs, clipStart, clipEnd),
                durationSec: nextDur,
              }
            : p
        )
      );
      return;
    }

    // overlays
    if (drag.kind === "overlay-move") {
      const nextFrom = clamp(drag.startFrom + deltaClip, 0, Math.max(0, len - barLen));
      const nextTo = nextFrom + barLen;
      const absFrom = mapping.clipToAbs(nextFrom).absSec;
      const absTo = mapping.clipToAbs(nextTo).absSec;
      setOverlays(
        overlays.map((o) =>
          o.id === drag.id
            ? {
                ...o,
                startSec: clamp(Math.min(absFrom, absTo), clipStart, clipEnd),
                endSec: clamp(Math.max(absFrom, absTo), clipStart, clipEnd),
              }
            : o
        )
      );
      return;
    }

    if (drag.kind === "overlay-resize-start") {
      const nextFrom = clamp(drag.startFrom + deltaClip, 0, drag.startTo);
      const abs = mapping.clipToAbs(nextFrom).absSec;
      setOverlays(
        overlays.map((o) =>
          o.id === drag.id
            ? {
                ...o,
                startSec: clamp(abs, clipStart, Math.max(clipStart, o.endSec - 0.05)),
              }
            : o
        )
      );
      return;
    }

    if (drag.kind === "overlay-resize-end") {
      const nextTo = clamp(drag.startTo + deltaClip, drag.startFrom, len);
      const abs = mapping.clipToAbs(nextTo).absSec;
      setOverlays(
        overlays.map((o) =>
          o.id === drag.id
            ? {
                ...o,
                endSec: clamp(abs, Math.min(clipEnd, o.startSec + 0.05), clipEnd),
              }
            : o
        )
      );
      return;
    }
  }

  function onPointerUp() {
    dragRef.current = null;
    onEndEdit?.();
  }

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

      <div className="mt-3 grid grid-cols-[120px_1fr] gap-2">
        {/* Clip row */}
        <div className="pt-2 text-xs font-semibold text-zinc-700">Klip</div>
        <div
          ref={hostRef}
          className="relative h-10 cursor-pointer rounded-md bg-zinc-100"
          onMouseDown={seekFromEvent}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div className="absolute inset-y-0 left-0 right-0 rounded-md bg-zinc-200" />

          {/* Pause segments (visual) */}
          {pauseBars.map((p) => {
            const x = clamp01(p.from / len);
            const w = clamp01((p.to - p.from) / len);
            return (
              <div
                key={p.id}
                className="absolute inset-y-1 rounded bg-purple-300/70"
                style={{ left: `${x * 100}%`, width: `${Math.max(0.4, w * 100)}%` }}
                title={`Pause ${p.durationSec.toFixed(1)}s`}
              />
            );
          })}

          {/* Clip handles */}
          <div
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-md bg-zinc-900/70"
            title="Træk for at ændre start"
            onPointerDown={(e) => beginDrag(e, { kind: "clip-start", startClientX: e.clientX, startAbsStart: clipStart, startAbsEnd: clipEnd })}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <div
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-md bg-zinc-900/70"
            title="Træk for at ændre slut"
            onPointerDown={(e) => beginDrag(e, { kind: "clip-end", startClientX: e.clientX, startAbsStart: clipStart, startAbsEnd: clipEnd })}
            onMouseDown={(e) => e.stopPropagation()}
          />

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-zinc-900"
            style={{ left: `${clamp01(currentClipSec / len) * 100}%` }}
          />
        </div>

        {/* Pause row */}
        <div className="pt-2 text-xs font-semibold text-zinc-700">Pauser</div>
        <div
          className="relative h-8 cursor-pointer rounded-md bg-zinc-50"
          onMouseDown={seekFromEvent}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {pauseBars.map((p) => {
            const x = clamp01(p.from / len);
            const w = clamp01((p.to - p.from) / len);
            const left = `${x * 100}%`;
            const width = `${Math.max(0.4, w * 100)}%`;
            return (
              <div
                key={p.id}
                className="absolute inset-y-1 rounded bg-purple-500/40 ring-1 ring-purple-700/30"
                style={{ left, width }}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  beginDrag(e, { kind: "pause-move", id: p.id, startClientX: e.clientX, startFrom: p.from, startTo: p.to });
                }}
                title={`Træk pause (id ${p.id})`}
              >
                <div
                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-purple-700/40"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginDrag(e, {
                      kind: "pause-resize-start",
                      id: p.id,
                      startClientX: e.clientX,
                      startFrom: p.from,
                      startTo: p.to,
                    });
                  }}
                  title="Juster start"
                />
                <div
                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-purple-700/40"
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginDrag(e, {
                      kind: "pause-resize-end",
                      id: p.id,
                      startClientX: e.clientX,
                      startFrom: p.from,
                      startTo: p.to,
                    });
                  }}
                  title="Juster slut"
                />
              </div>
            );
          })}

          <div
            className="absolute top-0 bottom-0 w-0.5 bg-zinc-900"
            style={{ left: `${clamp01(currentClipSec / len) * 100}%` }}
          />
        </div>

        {/* Overlay rows */}
        {overlayBars.map((b) => {
          const x = clamp01(b.from / len);
          const w = clamp01((b.to - b.from) / len);
          const isSel = selectedOverlayId === b.id;
          return (
            <div key={b.id} className="contents">
              <button
                type="button"
                className={
                  "truncate rounded-md border px-2 py-1 text-left text-xs " +
                  (isSel ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50")
                }
                onClick={() => setSelectedOverlayId(b.id)}
                title={b.id}
              >
                {b.type.toUpperCase()}
              </button>
              <div
                className={
                  "relative h-8 cursor-pointer rounded-md " +
                  (isSel ? "bg-zinc-100" : "bg-zinc-50")
                }
                onMouseDown={(e) => {
                  setSelectedOverlayId(b.id);
                  seekFromEvent(e);
                }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <div
                  className={
                    "absolute inset-y-1 rounded ring-1 " +
                    (isSel
                      ? "bg-zinc-900/20 ring-zinc-900/40"
                      : "bg-zinc-900/10 ring-zinc-900/25")
                  }
                  style={{ left: `${x * 100}%`, width: `${Math.max(0.4, w * 100)}%` }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    beginDrag(e, {
                      kind: "overlay-move",
                      id: b.id,
                      startClientX: e.clientX,
                      startFrom: b.from,
                      startTo: b.to,
                    });
                  }}
                  title="Træk / juster overlay"
                >
                  <div
                    className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-zinc-900/20"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      beginDrag(e, {
                        kind: "overlay-resize-start",
                        id: b.id,
                        startClientX: e.clientX,
                        startFrom: b.from,
                        startTo: b.to,
                      });
                    }}
                    title="Juster start"
                  />
                  <div
                    className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-zinc-900/20"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      beginDrag(e, {
                        kind: "overlay-resize-end",
                        id: b.id,
                        startClientX: e.clientX,
                        startFrom: b.from,
                        startTo: b.to,
                      });
                    }}
                    title="Juster slut"
                  />
                </div>

                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-zinc-900"
                  style={{ left: `${clamp01(currentClipSec / len) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
