"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { VideoEvent } from "@/components/stats/VideoSection";
import type { VideoClipDocV1 } from "@/components/video/types";
import { buildClipMapping } from "@/components/video/clipTimelineMath";
import YouTubeEditorPlayer, { type YouTubeEditorPlayerHandle } from "@/components/video/YouTubeEditorPlayer";
import { OverlayPreview } from "@/components/video/OverlayEditor";
import { parseYouTubeId } from "@/components/video/youtube";

export type AssignedVideoClip = {
  clipId: string;
  title: string;
  clipName: string | null;
  matchTitle: string | null;
  videoUrl: string | null;
  startSec: number | null;
  endSec: number | null;
  addedAt: string;
  doc: VideoClipDocV1 | null;
};

function formatSeconds(total: number) {
  const t = Math.max(0, Math.floor(total));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getEventPlayerName(e: VideoEvent) {
  const p1 = String(e.p1Name ?? "").trim();
  if (p1) return p1;
  const p2 = String(e.p2Name ?? "").trim();
  if (p2) return p2;
  const g = String(e.goalieName ?? "").trim();
  if (g) return g;
  return "-";
}

type Segment =
  | {
      kind: "event";
      id: string;
      label: string;
      subLabel: string;
      videoUrl: string;
      clipStart: number;
      clipEnd: number;
    }
  | {
      kind: "assigned";
      id: string;
      label: string;
      subLabel: string;
      videoUrl: string;
      doc: VideoClipDocV1;
    };

export default function SpillerVideoPlayer({
  events,
  assignedClips,
  assignedLoading,
  canDeleteAssigned,
  onDeleteAssigned,
}: {
  events: VideoEvent[];
  assignedClips: AssignedVideoClip[];
  assignedLoading?: boolean;
  canDeleteAssigned?: boolean;
  onDeleteAssigned?: (clipId: string) => void | Promise<void>;
}) {
  const [beforeSec, setBeforeSec] = useState<number>(7);
  const [afterSec, setAfterSec] = useState<number>(3);

  const [playerOpen, setPlayerOpen] = useState(false);
  const [autoplayRequested, setAutoplayRequested] = useState(false);

  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playAllEvents, setPlayAllEvents] = useState(false);

  const [currentSec, setCurrentSec] = useState(0);
  const [currentClipSec, setCurrentClipSec] = useState(0);

  const playerRef = useRef<YouTubeEditorPlayerHandle | null>(null);
  const playerReadyRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const internalPauseRef = useRef(false);
  const lastInternalActionAtRef = useRef(0);
  const lastDesiredPauseRef = useRef<boolean | null>(null);
  const playOriginRef = useRef<{ wallMs: number; clipSec: number } | null>(null);
  const playLoopRef = useRef<number | null>(null);
  const lastAbsRef = useRef(0);

  function markInternalAction() {
    lastInternalActionAtRef.current = performance.now();
  }

  const eventSegments = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      const ad = a.gameDate ? new Date(a.gameDate).getTime() : Infinity;
      const bd = b.gameDate ? new Date(b.gameDate).getTime() : Infinity;
      if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return ad - bd; // oldest first
      if (Number.isFinite(ad) !== Number.isFinite(bd)) return Number.isFinite(ad) ? -1 : 1;

      const ar = typeof a.rowId === "number" && Number.isFinite(a.rowId) ? a.rowId : Infinity;
      const br = typeof b.rowId === "number" && Number.isFinite(b.rowId) ? b.rowId : Infinity;
      if (ar !== br) return ar - br;

      return String(a.id).localeCompare(String(b.id));
    });

    return sorted
      .map((e) => {
        const ytId = parseYouTubeId(e.videoUrl ?? null);
        const t = typeof e.videoTime === "number" && Number.isFinite(e.videoTime) ? e.videoTime : null;
        const start = t !== null ? Math.max(0, Math.floor(t - beforeSec)) : null;
        const end = t !== null ? Math.max(0, Math.floor(t + afterSec)) : null;
        if (!ytId || start === null || end === null) return null;
        const label = `${e.teamName ?? "-"} • ${e.event}`;
        const subLabel = `Spiller: ${getEventPlayerName(e)} • ${formatSeconds(start)}-${formatSeconds(end)}`;
        return {
          kind: "event" as const,
          id: `event:${e.id}`,
          label,
          subLabel,
          videoUrl: e.videoUrl as string,
          clipStart: start,
          clipEnd: Math.max(start + 1, end),
        };
      })
      .filter(Boolean) as Segment[];
  }, [events, beforeSec, afterSec]);

  const assignedSegments = useMemo(() => {
    return assignedClips
      .map((c) => {
        const doc = c.doc;
        if (!doc || doc.version !== 1) return null;
        const ytId = parseYouTubeId(doc.videoUrl);
        if (!ytId) return null;
        const label = String(c.clipName ?? "").trim() || c.title;
        const subLabel = `${c.matchTitle ?? doc.matchTitle ?? "-"} • ${formatSeconds(doc.startSec)}-${formatSeconds(doc.endSec)}`;
        return {
          kind: "assigned" as const,
          id: `assigned:${c.clipId}`,
          label,
          subLabel,
          videoUrl: doc.videoUrl,
          doc,
        };
      })
      .filter(Boolean) as Segment[];
  }, [assignedClips]);

  const segments = useMemo(() => [...eventSegments, ...assignedSegments], [eventSegments, assignedSegments]);

  const selected = useMemo(() => {
    if (!selectedSegmentId) return null;
    return segments.find((s) => s.id === selectedSegmentId) ?? null;
  }, [segments, selectedSegmentId]);

  // Pick initial selection
  useEffect(() => {
    if (selectedSegmentId) return;
    if (eventSegments.length > 0) {
      setSelectedSegmentId(eventSegments[0]!.id);
      return;
    }
    if (assignedSegments.length > 0) {
      setSelectedSegmentId(assignedSegments[0]!.id);
    }
  }, [assignedSegments, eventSegments, selectedSegmentId]);

  const selectedVideoUrl = selected?.videoUrl ?? (eventSegments[0]?.videoUrl ?? assignedSegments[0]?.videoUrl ?? "");
  const selectedYtId = useMemo(() => parseYouTubeId(selectedVideoUrl), [selectedVideoUrl]);
  const lastYtIdRef = useRef<string | null>(null);

  const selectedMapping = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "event") return buildClipMapping({ clipStart: selected.clipStart, clipEnd: selected.clipEnd, pauses: [] });
    return buildClipMapping({ clipStart: selected.doc.startSec, clipEnd: selected.doc.endSec, pauses: selected.doc.pauses ?? [] });
  }, [selected]);

  // If the underlying YouTube video changes, the iframe is recreated; wait for onReady again.
  useEffect(() => {
    if (lastYtIdRef.current === selectedYtId) return;
    lastYtIdRef.current = selectedYtId;
    playerReadyRef.current = false;
  }, [selectedYtId]);

  function getNow() {
    return playerRef.current?.getCurrentTime() ?? 0;
  }

  function stopPlayback() {
    setPlaying(false);
    setPlayAllEvents(false);
    try {
      internalPauseRef.current = true;
      markInternalAction();
      playerRef.current?.pause();
    } catch {
      // ignore
    }
    playOriginRef.current = null;
    lastDesiredPauseRef.current = null;
  }

  function startPlayback() {
    if (!selected || !selectedMapping) return;
    playOriginRef.current = { wallMs: performance.now(), clipSec: currentClipSec };
    setPlaying(true);
  }

  function closePlayer() {
    stopPlayback();
    setAutoplayRequested(false);
    setPlayerOpen(false);
  }

  function openAndAutoplay() {
    setPlayerOpen(true);
    setAutoplayRequested(true);
  }

  function handlePlayerStateChange(state: number) {
    if (!playerOpen) return;
    const m = selectedMapping;
    if (!m) return;

    // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (state === 2) {
      // Ignore pauses we triggered ourselves (e.g., during clip pauses).
      if (internalPauseRef.current) {
        internalPauseRef.current = false;
        return;
      }

      // YouTube can emit PAUSED during internal seek/buffering timing.
      // Treat it as user pause only if it did not happen right after our own commands.
      const msSinceInternal = performance.now() - lastInternalActionAtRef.current;
      if (msSinceInternal >= 0 && msSinceInternal < 650) return;

      // User paused via YouTube controls.
      setPlaying(false);
      playOriginRef.current = null;
      lastDesiredPauseRef.current = null;
      return;
    }

    if (state === 1) {
      // User hit play via YouTube controls; resume our loop so overlays/pauses & play-all work.
      if (playing) return;
      const abs = getNow();
      const clip = m.absToClip(abs);
      setCurrentSec(abs);
      setCurrentClipSec(clip);
      lastAbsRef.current = abs;
      playOriginRef.current = { wallMs: performance.now(), clipSec: clip };
      setPlaying(true);
    }
  }

  // React to player ready
  function handleReady() {
    playerReadyRef.current = true;
    // Seek to selection start for a predictable starting point
    const m = selectedMapping;
    if (!m) return;
    const start = m.clipToAbs(currentClipSec);
    markInternalAction();
    playerRef.current?.seekTo(start.absSec);
    setCurrentSec(start.absSec);

    if (autoplayRequested) {
      setAutoplayRequested(false);
      startPlayback();
    }
  }

  // Reset ready flag when closing so we don't assume a ready iframe.
  useEffect(() => {
    if (playerOpen) return;
    playerReadyRef.current = false;
  }, [playerOpen]);

  // If selection or mapping changes, reset position and stop.
  useEffect(() => {
    if (!selected || !selectedMapping) return;
    const isAuto = autoAdvanceRef.current;
    autoAdvanceRef.current = false;

    if (!isAuto) {
      stopPlayback();
    }

    setCurrentClipSec(0);
    const start = selectedMapping.clipToAbs(0);
    if (playerOpen && playerReadyRef.current) {
      markInternalAction();
      playerRef.current?.seekTo(start.absSec);
      setCurrentSec(start.absSec);
      lastAbsRef.current = start.absSec;
    }

    // If this selection change was due to play-all advancing, keep going.
    if (isAuto) {
      setAutoplayRequested(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSegmentId]);

  // If we request autoplay while already open and ready, start immediately.
  useEffect(() => {
    if (!playerOpen) return;
    if (!autoplayRequested) return;
    if (!playerReadyRef.current) return;
    if (!selected || !selectedMapping) return;
    setAutoplayRequested(false);
    startPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplayRequested, playerOpen, selectedSegmentId]);

  // Playback loop (same core logic as leader editor)
  useEffect(() => {
    if (!playerOpen || !playing) {
      if (playLoopRef.current) cancelAnimationFrame(playLoopRef.current);
      playLoopRef.current = null;
      return;
    }

    if (!selected || !selectedMapping) {
      setPlaying(false);
      return;
    }

    const m = selectedMapping;

    if (!playOriginRef.current) playOriginRef.current = { wallMs: performance.now(), clipSec: 0 };

    const start = m.clipToAbs(playOriginRef.current.clipSec);
    markInternalAction();
    playerRef.current?.seekTo(start.absSec);
    if (!start.inPause) {
      playerRef.current?.play();
      lastDesiredPauseRef.current = false;
    } else {
      internalPauseRef.current = true;
      markInternalAction();
      playerRef.current?.pause();
      lastDesiredPauseRef.current = true;
    }

    let stopped = false;

    const loop = () => {
      if (stopped) return;

      const origin = playOriginRef.current;
      if (!origin) {
        setPlaying(false);
        return;
      }

      const elapsed = (performance.now() - origin.wallMs) / 1000;
      const clipPos = origin.clipSec + Math.max(0, elapsed);

      if (clipPos >= m.totalLen - 0.01) {
        internalPauseRef.current = true;
        markInternalAction();
        playerRef.current?.pause();
        setCurrentClipSec(m.totalLen);

        const endAbs = m.clipToAbs(m.totalLen).absSec;
        setCurrentSec(endAbs);

        if (playAllEvents && selected.kind === "event") {
          const idx = eventSegments.findIndex((s) => s.id === selected.id);
          const nextIdx = idx >= 0 ? idx + 1 : -1;
          const next = nextIdx >= 0 && nextIdx < eventSegments.length ? eventSegments[nextIdx] : null;
          if (next) {
            autoAdvanceRef.current = true;
            setPlaying(false);
            playOriginRef.current = null;
            setSelectedSegmentId(next.id);
            return;
          }
        }

        setPlaying(false);
        setPlayAllEvents(false);
        return;
      }

      const desired = m.clipToAbs(clipPos);
      setCurrentClipSec(clipPos);
      setCurrentSec(desired.absSec);

      if (desired.inPause) {
        if (lastDesiredPauseRef.current !== true) {
          internalPauseRef.current = true;
          markInternalAction();
          playerRef.current?.pause();
          lastDesiredPauseRef.current = true;
        }
        const nowAbs = getNow();
        if (Math.abs(nowAbs - desired.absSec) > 0.25) {
          markInternalAction();
          playerRef.current?.seekTo(desired.absSec);
        }
      } else {
        if (lastDesiredPauseRef.current !== false) {
          playerRef.current?.play();
          lastDesiredPauseRef.current = false;
        }
        const nowAbs = getNow();
        if (Math.abs(nowAbs - desired.absSec) > 0.7) {
          markInternalAction();
          playerRef.current?.seekTo(desired.absSec);
        }
      }

      playLoopRef.current = requestAnimationFrame(loop);
    };

    playLoopRef.current = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      if (playLoopRef.current) cancelAnimationFrame(playLoopRef.current);
      playLoopRef.current = null;
    };
  }, [playing, playAllEvents, selected, selectedMapping, eventSegments]);

  // Keep overlay in sync if user scrubs using YouTube controls while paused.
  useEffect(() => {
    if (!playerOpen) return;
    if (playing) return;
    const id = window.setInterval(() => {
      if (playing) return;
      const abs = getNow();
      setCurrentSec(abs);
      const m = selectedMapping;
      if (m && Math.abs(abs - lastAbsRef.current) > 0.05) {
        setCurrentClipSec(m.absToClip(abs));
        lastAbsRef.current = abs;
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [playerOpen, playing, selectedMapping]);

  const overlayNode = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "assigned") {
      return <OverlayPreview currentSec={currentSec} overlays={selected.doc.overlays ?? []} />;
    }
    return null;
  }, [currentSec, selected]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-zinc-800">Tilføjede klip</div>
          {assignedLoading ? <div className="text-xs text-zinc-500">Henter…</div> : null}
        </div>

        <div className="max-h-[320px] overflow-auto rounded-md border border-zinc-200">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50">
              <tr className="border-b border-zinc-200 text-left">
                <th className="py-2 pl-3 pr-2">Klip</th>
                <th className="py-2 pr-2">Kamp</th>
                <th className="py-2 pr-2">Tid</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {assignedClips.map((c) => {
                const label = String(c.clipName ?? "").trim() || c.title;
                const doc = c.doc;
                const hasDoc = !!doc && doc.version === 1;
                const isSelected = selectedSegmentId === `assigned:${c.clipId}`;
                const time = hasDoc ? `${formatSeconds(doc!.startSec)}-${formatSeconds(doc!.endSec)}` : "-";
                return (
                  <tr
                    key={c.clipId}
                    className={"border-b border-zinc-200 " + (hasDoc ? "cursor-pointer" : "opacity-50") + (isSelected ? " bg-zinc-50" : "")}
                    onClick={() => {
                      if (!hasDoc) return;
                      setSelectedSegmentId(`assigned:${c.clipId}`);
                      setPlayAllEvents(false);
                      setCurrentClipSec(0);
                      openAndAutoplay();
                    }}
                  >
                    <td className="py-2 pl-3 pr-2 font-medium">{label}</td>
                    <td className="py-2 pr-2">{c.matchTitle ?? "-"}</td>
                    <td className="py-2 pr-2">{time}</td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        className="mr-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                        disabled={!hasDoc}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!hasDoc) return;
                          setSelectedSegmentId(`assigned:${c.clipId}`);
                          setPlayAllEvents(false);
                          setCurrentClipSec(0);
                          openAndAutoplay();
                        }}
                      >
                        Afspil
                      </button>
                      {canDeleteAssigned ? (
                        <button
                          type="button"
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteAssigned?.(c.clipId);
                          }}
                        >
                          Slet
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {assignedClips.length === 0 && !assignedLoading ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-zinc-600" colSpan={4}>
                    Ingen tilføjede klip endnu.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1">
            <span className="text-zinc-600">Tid før</span>
            <input
              type="number"
              min={0}
              max={120}
              value={beforeSec}
              onChange={(e) => setBeforeSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1"
            />
            <span className="text-zinc-600">s</span>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-zinc-600">Tid efter</span>
            <input
              type="number"
              min={0}
              max={120}
              value={afterSec}
              onChange={(e) => setAfterSec(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1"
            />
            <span className="text-zinc-600">s</span>
          </label>

          <button
            type="button"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            disabled={eventSegments.length === 0}
            onClick={() => {
              if (eventSegments.length === 0) return;
              setSelectedSegmentId(eventSegments[0]!.id);
              setCurrentClipSec(0);
              setPlayAllEvents(true);
              openAndAutoplay();
            }}
          >
            Afspil Alle
          </button>
        </div>

        {selected ? (
          <div className="text-xs text-zinc-600">
            Valgt: {selected.label} {selected.subLabel ? `• ${selected.subLabel}` : ""}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-zinc-800">Events</div>
        <div className="max-h-[320px] overflow-auto rounded-md border border-zinc-200">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-zinc-50">
              <tr className="border-b border-zinc-200 text-left">
                <th className="py-2 pl-3 pr-2">Hold</th>
                <th className="py-2 pr-2">Event</th>
                <th className="py-2 pr-3">Spiller</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {eventSegments.map((s) => {
                const isSelected = selectedSegmentId === s.id;
                const parts = s.label.split(" • ");
                const team = parts[0] ?? "-";
                const ev = parts.slice(1).join(" • ") || "-";
                const player = s.subLabel.includes("Spiller:") ? s.subLabel.split("Spiller:")[1]?.split("•")[0]?.trim() : "-";
                return (
                  <tr
                    key={s.id}
                    className={"border-b border-zinc-200 cursor-pointer " + (isSelected ? "bg-zinc-50" : "")}
                    onClick={() => {
                      setSelectedSegmentId(s.id);
                      setPlayAllEvents(false);
                      setCurrentClipSec(0);
                      openAndAutoplay();
                    }}
                  >
                    <td className="py-2 pl-3 pr-2">{team}</td>
                    <td className="py-2 pr-2 font-medium">{ev}</td>
                    <td className="py-2 pr-3">{player || "-"}</td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSegmentId(s.id);
                          setPlayAllEvents(false);
                          setCurrentClipSec(0);
                          openAndAutoplay();
                        }}
                      >
                        Afspil
                      </button>
                    </td>
                  </tr>
                );
              })}
              {eventSegments.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-sm text-zinc-600" colSpan={4}>
                    Ingen events.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {playerOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePlayer();
          }}
        >
          <div className="w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">Video</div>
                {selected ? (
                  <div className="truncate text-xs text-zinc-600">
                    {selected.label} {selected.subLabel ? `• ${selected.subLabel}` : ""}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => closePlayer()}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm"
              >
                Luk
              </button>
            </div>

            <div className="p-4">
              <YouTubeEditorPlayer
                videoUrl={selectedVideoUrl}
                playerRef={playerRef}
                onReady={handleReady}
                onStateChange={handlePlayerStateChange}
                overlay={overlayNode}
                overlayPointerEvents="none"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
