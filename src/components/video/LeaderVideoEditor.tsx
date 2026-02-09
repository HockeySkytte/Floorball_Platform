"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import YouTubeEditorPlayer, { type YouTubeEditorPlayerHandle } from "@/components/video/YouTubeEditorPlayer";
import {
  OverlayCanvas,
  OverlayList,
  OverlayToolbar,
  type ArrowKind,
  type ArrowStyle,
  type OverlayTool,
} from "@/components/video/OverlayEditor";
import TimelineEditor from "@/components/video/TimelineEditor";
import type { VideoClipDocV1, VideoClipPause, VideoOverlay } from "@/components/video/types";
import { clamp, fmtClock, parseClock } from "@/components/video/time";
import { buildClipMapping } from "@/components/video/clipTimelineMath";
import StickerPicker from "@/components/video/StickerPicker";

type MatchRow = {
  id: string;
  title: string;
  videoUrl: string;
  matchDate: string;
};

type ClipRow = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

export default function LeaderVideoEditor() {
  const playerRef = useRef<YouTubeEditorPlayerHandle | null>(null);

  type Snapshot = {
    clipStart: number;
    clipEnd: number;
    pauses: VideoClipPause[];
    overlays: VideoOverlay[];
    selectedOverlayId: string | null;
    currentClipSec: number;
    clipName: string;
  };

  const historyRef = useRef<Snapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const editingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string>("");

  const [clips, setClips] = useState<ClipRow[]>([]);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedMatchId) ?? null,
    [matches, selectedMatchId]
  );

  const [clipStart, setClipStart] = useState<number | null>(null);
  const [clipEnd, setClipEnd] = useState<number | null>(null);
  const [clipName, setClipName] = useState<string>("");
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [pauses, setPauses] = useState<VideoClipPause[]>([]);
  const [overlays, setOverlays] = useState<VideoOverlay[]>([]);
  const [overlayTool, setOverlayTool] = useState<OverlayTool>("text");
  const [overlayColor, setOverlayColor] = useState("#a855f7");
  const [overlayStrokeWidth, setOverlayStrokeWidth] = useState(4);
  const [overlaySize, setOverlaySize] = useState(96);
  const [arrowKind, setArrowKind] = useState<ArrowKind>("line");
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle>("solid");
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [stickerId, setStickerId] = useState("target");
  const [selectedOverlaySizeInput, setSelectedOverlaySizeInput] = useState("");
  const [selectedOverlayWidthInput, setSelectedOverlayWidthInput] = useState("");
  const [selectedOverlayColorInput, setSelectedOverlayColorInput] = useState("");

  const [pauseDurationInput, setPauseDurationInput] = useState("2");

  const [currentSec, setCurrentSec] = useState(0);
  const [currentClipSec, setCurrentClipSec] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playLoopRef = useRef<number | null>(null);
  const lastAbsRef = useRef<number>(0);
  const playOriginRef = useRef<{ wallMs: number; clipSec: number } | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const playerWrapRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFs = () => {
      const el = document.fullscreenElement;
      setIsFullscreen(Boolean(el && playerWrapRef.current && el === playerWrapRef.current));
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    const el = playerWrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      window.alert("Fuldskærm understøttes ikke i denne browser.");
    }
  }

  const selectedOverlay = useMemo(
    () => overlays.find((o) => o.id === selectedOverlayId) ?? null,
    [overlays, selectedOverlayId]
  );

  useEffect(() => {
    if (!selectedOverlay) {
      setSelectedOverlaySizeInput("");
      setSelectedOverlayWidthInput("");
      setSelectedOverlayColorInput("");
      return;
    }
    const size = (() => {
      switch (selectedOverlay.type) {
        case "text":
          return selectedOverlay.fontSize;
        case "sticker":
          return selectedOverlay.size;
        case "circle":
          return Math.round((selectedOverlay.r / 0.9) * 1000);
        case "arrow":
          return selectedOverlay.width;
        case "pen":
          return selectedOverlay.width;
      }
    })();
    setSelectedOverlaySizeInput(String(Math.round(size)));

    const width = (() => {
      switch (selectedOverlay.type) {
        case "arrow":
          return selectedOverlay.width;
        case "circle":
          return selectedOverlay.width;
        case "pen":
          return selectedOverlay.width;
        case "text":
          return null;
        case "sticker":
          return null;
      }
    })();
    setSelectedOverlayWidthInput(width === null ? "" : String(Math.round(width)));
    setSelectedOverlayColorInput(selectedOverlay.color);
  }, [selectedOverlayId, selectedOverlay]);

  function clonePauses(list: VideoClipPause[]) {
    return list.map((p) => ({ ...p }));
  }

  function cloneOverlays(list: VideoOverlay[]) {
    return list.map((o) => {
      if (o.type === "pen") return { ...o, points: o.points.map((pt) => ({ ...pt })) };
      return { ...o };
    });
  }

  function syncHistoryButtons() {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1);
  }

  function takeSnapshot(): Snapshot | null {
    if (clipStart === null || clipEnd === null) return null;
    return {
      clipStart,
      clipEnd,
      pauses: clonePauses(pauses),
      overlays: cloneOverlays(overlays),
      selectedOverlayId,
      currentClipSec,
      clipName,
    };
  }

  function clearHistory() {
    historyRef.current = [];
    historyIndexRef.current = -1;
    syncHistoryButtons();
  }

  function resetHistory() {
    const snap = takeSnapshot();
    historyRef.current = snap ? [snap] : [];
    historyIndexRef.current = snap ? 0 : -1;
    syncHistoryButtons();
  }

  function pushHistory() {
    const snap = takeSnapshot();
    if (!snap) return;
    const idx = historyIndexRef.current;
    const next = historyRef.current.slice(0, Math.max(0, idx + 1));
    next.push(snap);
    if (next.length > 80) next.splice(0, next.length - 80);
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
    syncHistoryButtons();
  }

  function restoreSnapshot(snap: Snapshot) {
    editingRef.current = false;
    setClipStart(snap.clipStart);
    setClipEnd(snap.clipEnd);
    setClipName(snap.clipName ?? "");
    setPauses(clonePauses(snap.pauses));
    setOverlays(cloneOverlays(snap.overlays));
    setSelectedOverlayId(snap.selectedOverlayId);
    setCurrentClipSec(snap.currentClipSec);
    setStartInput(fmtClock(snap.clipStart));
    setEndInput(fmtClock(snap.clipEnd));

    try {
      const m = buildClipMapping({ clipStart: snap.clipStart, clipEnd: snap.clipEnd, pauses: snap.pauses });
      const r = m.clipToAbs(snap.currentClipSec);
      setCurrentSec(r.absSec);
      lastAbsRef.current = r.absSec;
      playerRef.current?.seekTo?.(r.absSec);
      if (r.inPause) playerRef.current?.pause?.();
    } catch {
      // ignore
    }
  }

  function undo() {
    if (historyIndexRef.current <= 0) return;
    const nextIndex = historyIndexRef.current - 1;
    const snap = historyRef.current[nextIndex];
    if (!snap) return;
    historyIndexRef.current = nextIndex;
    restoreSnapshot(snap);
    syncHistoryButtons();
  }

  function redo() {
    if (historyIndexRef.current < 0) return;
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    const nextIndex = historyIndexRef.current + 1;
    const snap = historyRef.current[nextIndex];
    if (!snap) return;
    historyIndexRef.current = nextIndex;
    restoreSnapshot(snap);
    syncHistoryButtons();
  }

  function beginEdit() {
    if (editingRef.current) return;
    pushHistory();
    editingRef.current = true;
  }

  function endEdit() {
    editingRef.current = false;
  }

  function applySelectedOverlaySize(next: number) {
    if (!selectedOverlay) return;
    if (!editingRef.current) pushHistory();
    const n = Math.max(1, Number(next) || 1);
    setOverlays(
      overlays.map((o) => {
        if (o.id !== selectedOverlay.id) return o;
        switch (o.type) {
          case "text":
            return { ...o, fontSize: n };
          case "sticker":
            return { ...o, size: n };
          case "circle":
            return { ...o, r: Math.max(0.005, Math.min(0.45, (n / 1000) * 0.9)) };
          case "arrow":
            return { ...o, width: n };
          case "pen":
            return { ...o, width: n };
        }
      })
    );
  }

  function applySelectedOverlayWidth(next: number) {
    if (!selectedOverlay) return;
    if (selectedOverlay.type === "text" || selectedOverlay.type === "sticker") return;
    if (!editingRef.current) pushHistory();
    const n = Math.max(1, Number(next) || 1);
    setOverlays(
      overlays.map((o) => {
        if (o.id !== selectedOverlay.id) return o;
        if (o.type === "arrow" || o.type === "circle" || o.type === "pen") return { ...o, width: n };
        return o;
      })
    );
  }

  function applySelectedOverlayColor(next: string) {
    if (!selectedOverlay) return;
    if (!editingRef.current) pushHistory();
    const c = String(next || "#000000");
    setOverlays(overlays.map((o) => (o.id === selectedOverlay.id ? { ...o, color: c } : o)));
  }

  function applySelectedArrowStyle(next: "solid" | "dashed" | "wavy") {
    if (!selectedOverlay) return;
    if (selectedOverlay.type !== "arrow") return;
    if (!editingRef.current) pushHistory();
    const style = (String(next) as any) || "solid";
    setOverlays(overlays.map((o) => (o.id === selectedOverlay.id ? { ...o, style } : o)));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMatchesError(null);
      const res = await fetch("/api/leader/matches", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!cancelled) setMatchesError(data?.message ?? "Kunne ikke hente kampe.");
        return;
      }
      const list = Array.isArray(data?.matches) ? (data.matches as MatchRow[]) : [];
      if (!cancelled) {
        setMatches(list);
        if (!selectedMatchId && list.length > 0) setSelectedMatchId(list[0]!.id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadClips() {
    setClipsError(null);
    const res = await fetch("/api/leader/video-clips", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setClipsError(data?.message ?? "Kunne ikke hente videoklip.");
      setClips([]);
      return;
    }
    setClips(Array.isArray(data?.clips) ? (data.clips as ClipRow[]) : []);
  }

  useEffect(() => {
    void loadClips();
  }, []);

  function resetEditor() {
    setSelectedClipId(null);
    setClipStart(null);
    setClipEnd(null);
    setClipName("");
    setPauses([]);
    setOverlays([]);
    setSelectedOverlayId(null);
    setSaveError(null);
    setCurrentClipSec(0);
    lastAbsRef.current = 0;
    playOriginRef.current = null;
    editingRef.current = false;
    clearHistory();
  }

  async function openClip(id: string) {
    resetEditor();
    setSelectedClipId(id);

    const res = await fetch(`/api/leader/video-clips/${id}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveError(data?.message ?? "Kunne ikke åbne klip.");
      return;
    }

    try {
      const clip = data?.clip;
      const doc = JSON.parse(String(clip?.content ?? "")) as VideoClipDocV1;
      if (doc?.version !== 1) throw new Error("Ugyldigt dokument.");

      setSelectedMatchId(doc.matchId);
      setClipName(String(doc.clipName ?? clip?.title ?? ""));
      setClipStart(doc.startSec);
      setClipEnd(doc.endSec);
      setStartInput(fmtClock(doc.startSec));
      setEndInput(fmtClock(doc.endSec));
      setPauses(Array.isArray(doc.pauses) ? doc.pauses : []);
      setOverlays(Array.isArray(doc.overlays) ? doc.overlays : []);

      // Seek to clip start
      setTimeout(() => {
        playerRef.current?.seekTo(doc.startSec);
      }, 50);
    } catch {
      setSaveError("Klip JSON kunne ikke læses.");
    }
  }

  function getNow() {
    return playerRef.current?.getCurrentTime?.() ?? 0;
  }

  function recordStart() {
    if (!selectedMatch) return;
    const t = getNow();
    setClipStart(t);
    setClipEnd(null);
    setClipName("");
    setStartInput(fmtClock(t));
    setEndInput("");
    setSelectedClipId(null);
    setPauses([]);
    setOverlays([]);
    setSelectedOverlayId(null);
    setSaveError(null);
    setCurrentClipSec(0);
    lastAbsRef.current = 0;
    playOriginRef.current = null;
    editingRef.current = false;
    clearHistory();
  }

  function setClipStartAbs(nextAbs: number) {
    if (!editingRef.current) pushHistory();
    if (clipEnd === null) {
      setClipStart(Math.max(0, nextAbs));
      return;
    }
    const end = clipEnd;
    const start = clamp(nextAbs, 0, end - 0.2);
    setClipStart(start);
    if (end <= start + 0.2) setClipEnd(start + 0.2);
    setPauses(pauses.filter((p) => p.atSec >= start && p.atSec <= end));
    setOverlays(
      overlays.map((o) => ({
        ...o,
        startSec: clamp(o.startSec, start, end),
        endSec: clamp(o.endSec, start, end),
      }))
    );
  }

  function setClipEndAbs(nextAbs: number) {
    if (!editingRef.current) pushHistory();
    if (clipStart === null) {
      setClipEnd(Math.max(0, nextAbs));
      return;
    }
    const start = clipStart;
    const end = Math.max(nextAbs, start + 0.2);
    setClipEnd(end);
    setPauses(pauses.filter((p) => p.atSec >= start && p.atSec <= end));
    setOverlays(
      overlays.map((o) => ({
        ...o,
        startSec: clamp(o.startSec, start, end),
        endSec: clamp(o.endSec, start, end),
      }))
    );
  }

  function recordEnd() {
    if (!selectedMatch) return;
    const t = getNow();
    if (clipStart === null) {
      setClipStart(t);
      setClipEnd(t + 10);
      setStartInput(fmtClock(t));
      setEndInput(fmtClock(t + 10));
    } else {
      const end = Math.max(t, clipStart + 0.2);
      setClipEnd(end);
      setEndInput(fmtClock(end));
    }
  }

  const canEdit = selectedMatch && clipStart !== null && clipEnd !== null && clipEnd > clipStart;

  const mapping = useMemo(() => {
    if (!canEdit) return null;
    return buildClipMapping({ clipStart: clipStart!, clipEnd: clipEnd!, pauses });
  }, [canEdit, clipStart, clipEnd, pauses]);

  function onSeek(absSec: number) {
    playerRef.current?.seekTo(absSec);
    setCurrentSec(absSec);
  }

  function onSeekClip(nextClipSec: number) {
    if (!canEdit) return;
    const m = mapping;
    if (!m) return;
    const clipSec = clamp(nextClipSec, 0, m.totalLen);
    const r = m.clipToAbs(clipSec);
    playerRef.current?.seekTo(r.absSec);
    if (r.inPause) {
      try {
        playerRef.current?.pause?.();
      } catch {
        // ignore
      }
    }
    setCurrentClipSec(clipSec);
    setCurrentSec(r.absSec);
    lastAbsRef.current = r.absSec;
  }

  function seekRel(deltaSec: number) {
    if (!canEdit) return;
    const m = mapping;
    if (!m) return;
    onSeekClip(currentClipSec + deltaSec);
  }

  async function saveClip() {
    if (!selectedMatch) return;
    if (!canEdit) return;
    if (saveBusy) return;

    setSaveBusy(true);
    setSaveError(null);

    try {
      const doc: VideoClipDocV1 = {
        version: 1,
        matchId: selectedMatch.id,
        matchTitle: selectedMatch.title,
        videoUrl: selectedMatch.videoUrl,
        clipName: clipName.trim() || undefined,
        startSec: clipStart!,
        endSec: clipEnd!,
        pauses,
        overlays,
      };

      const fallbackTitle = `${new Date(selectedMatch.matchDate).toLocaleDateString("da-DK")} • ${selectedMatch.title} • ${fmtClock(clipStart!)}-${fmtClock(clipEnd!)}`;
      const title = (clipName.trim() || "") || fallbackTitle;

      if (selectedClipId) {
        const res = await fetch(`/api/leader/video-clips/${selectedClipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: JSON.stringify(doc) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSaveError(data?.message ?? "Kunne ikke gemme klip.");
          return;
        }
      } else {
        const res = await fetch("/api/leader/video-clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: JSON.stringify(doc) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSaveError(data?.message ?? "Kunne ikke oprette klip.");
          return;
        }
        setSelectedClipId(String(data?.clip?.id ?? "") || null);
      }

      await loadClips();
    } finally {
      setSaveBusy(false);
    }
  }

  async function deleteClip() {
    if (!selectedClipId) return;
    const ok = window.confirm("Slet klippet?");
    if (!ok) return;
    const res = await fetch(`/api/leader/video-clips/${selectedClipId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveError(data?.message ?? "Kunne ikke slette klip.");
      return;
    }
    resetEditor();
    await loadClips();
  }

  function playClip() {
    if (!canEdit) return;
    if (!mapping) return;
    playOriginRef.current = { wallMs: performance.now(), clipSec: currentClipSec };
    setPlaying(true);
  }

  function pauseClip() {
    setPlaying(false);
    try {
      playerRef.current?.pause?.();
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!playing) {
      if (playLoopRef.current) cancelAnimationFrame(playLoopRef.current);
      playLoopRef.current = null;
      try {
        playerRef.current?.pause?.();
      } catch {
        // ignore
      }
      return;
    }

    if (!canEdit) {
      setPlaying(false);
      return;
    }

    const m = mapping;
    if (!m) {
      setPlaying(false);
      return;
    }

    if (!playOriginRef.current) playOriginRef.current = { wallMs: performance.now(), clipSec: 0 };

    const start = m.clipToAbs(playOriginRef.current.clipSec);
    playerRef.current?.seekTo(start.absSec);
    if (!start.inPause) playerRef.current?.play();
    else {
      try {
        playerRef.current?.pause?.();
      } catch {
        // ignore
      }
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
        try {
          playerRef.current?.pause?.();
        } catch {
          // ignore
        }
        setCurrentClipSec(m.totalLen);
        setCurrentSec(clipEnd!);
        setPlaying(false);
        return;
      }

      const desired = m.clipToAbs(clipPos);
      setCurrentClipSec(clipPos);
      setCurrentSec(desired.absSec);

      if (desired.inPause) {
        try {
          playerRef.current?.pause?.();
        } catch {
          // ignore
        }
        // Ensure we are anchored to the pause frame
        const nowAbs = getNow();
        if (Math.abs(nowAbs - desired.absSec) > 0.25) playerRef.current?.seekTo(desired.absSec);
      } else {
        playerRef.current?.play();
        const nowAbs = getNow();
        // Gentle correction if the video drifts from the clip clock
        if (Math.abs(nowAbs - desired.absSec) > 0.7) playerRef.current?.seekTo(desired.absSec);
      }

      playLoopRef.current = requestAnimationFrame(loop);
    };

    playLoopRef.current = requestAnimationFrame(loop);

    return () => {
      stopped = true;
      if (playLoopRef.current) cancelAnimationFrame(playLoopRef.current);
      playLoopRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, canEdit, mapping, clipEnd]);

  function addPause() {
    if (!canEdit) return;
    if (!editingRef.current) pushHistory();
    const t = getNow();
    const durationSec = Math.max(0, Number(pauseDurationInput) || 0);
    setPauses([
      ...pauses,
      {
        id: makeId(),
        atSec: Math.min(Math.max(t, clipStart!), clipEnd!),
        durationSec,
      },
    ]);
  }

  useEffect(() => {
    // Keep overlay host sized to the video player.
    // currentSec + currentClipSec sync when not playing.
    if (playing) return;
    const id = window.setInterval(() => {
      if (playing) return;
      const abs = getNow();
      setCurrentSec(abs);
      const m = mapping;
      if (m && Math.abs(abs - lastAbsRef.current) > 0.05) {
        setCurrentClipSec(m.absToClip(abs));
        lastAbsRef.current = abs;
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, mapping]);

  function deleteOverlay(id: string) {
    if (!editingRef.current) pushHistory();
    setOverlays(overlays.filter((o) => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  }

  useEffect(() => {
    if (!canEdit) return;
    if (historyRef.current.length === 0) resetHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  useEffect(() => {
    if (clipStart === null) return;
    setStartInput(fmtClock(clipStart));
  }, [clipStart]);

  useEffect(() => {
    if (clipEnd === null) return;
    setEndInput(fmtClock(clipEnd));
  }, [clipEnd]);

  return (
    <main className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Video</h1>
        <p className="mt-1 text-sm text-zinc-600">Opret videoklip (JSON) fra dine kampe.</p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="text-sm font-semibold">Kamp</div>
            {matchesError ? <div className="mt-2 text-sm text-red-600">{matchesError}</div> : null}
            <select
              className="mt-2 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={selectedMatchId}
              onChange={(e) => {
                setSelectedMatchId(e.target.value);
                resetEditor();
              }}
              disabled={matches.length === 0}
            >
              {matches.map((m) => (
                <option key={m.id} value={m.id}>
                  {new Date(m.matchDate).toLocaleDateString("da-DK")} • {m.title}
                </option>
              ))}
            </select>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={recordStart}
                className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                disabled={!selectedMatch}
              >
                <span className="inline-block h-3 w-3 rounded-full bg-red-600" />
                <span>Optag</span>
              </button>
              <button
                type="button"
                onClick={recordEnd}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                disabled={!selectedMatch}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 bg-zinc-900" />
                  <span>Stop</span>
                </span>
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="col-span-2 block text-xs">
                <div className="mb-0.5 font-semibold">Navn</div>
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={clipName}
                  placeholder="Navngiv klippet…"
                  onChange={(e) => setClipName(e.target.value)}
                  disabled={!selectedMatch}
                />
              </label>
              <label className="block text-xs">
                <div className="mb-0.5 font-semibold">Start</div>
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={startInput}
                  placeholder="mm:ss"
                  onChange={(e) => setStartInput(e.target.value)}
                  onBlur={() => {
                    if (!selectedMatch) return;
                    const parsed = parseClock(startInput);
                    if (parsed === null) {
                      if (clipStart !== null) setStartInput(fmtClock(clipStart));
                      return;
                    }
                    const next = clamp(parsed, 0, Math.max(0, getNow() + 24 * 3600));
                    setClipStartAbs(next);
                  }}
                  disabled={!selectedMatch}
                />
              </label>
              <label className="block text-xs">
                <div className="mb-0.5 font-semibold">Slut</div>
                <input
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  value={endInput}
                  placeholder="mm:ss"
                  onChange={(e) => setEndInput(e.target.value)}
                  onBlur={() => {
                    if (!selectedMatch) return;
                    const parsed = parseClock(endInput);
                    if (parsed === null) {
                      if (clipEnd !== null) setEndInput(fmtClock(clipEnd));
                      return;
                    }
                    const next = clamp(parsed, 0, Math.max(0, getNow() + 24 * 3600));
                    setClipEndAbs(next);
                  }}
                  disabled={!selectedMatch}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveClip}
                className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)] disabled:opacity-60"
                disabled={!canEdit || saveBusy}
              >
                {selectedClipId ? (saveBusy ? "Gemmer…" : "Gem") : saveBusy ? "Opretter…" : "Opret klip"}
              </button>
              {selectedClipId ? (
                <button
                  type="button"
                  onClick={deleteClip}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                  disabled={saveBusy}
                >
                  Slet
                </button>
              ) : null}
            </div>

            {saveError ? <div className="mt-3 text-sm text-red-600">{saveError}</div> : null}
          </div>

          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">Klip</div>
              <button
                type="button"
                onClick={loadClips}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
              >
                Opdater
              </button>
            </div>
            {clipsError ? <div className="mt-2 text-sm text-red-600">{clipsError}</div> : null}

            {clips.length === 0 ? (
              <div className="mt-2 text-sm text-zinc-600">Ingen klip endnu.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {clips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void openClip(c.id)}
                    className={
                      "w-full rounded-md border px-3 py-2 text-left text-xs " +
                      (selectedClipId === c.id
                        ? "border-zinc-900 bg-zinc-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50")
                    }
                  >
                    <div className="truncate font-semibold">{c.title}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-600">
                      {new Date(c.updatedAt).toLocaleString("da-DK")}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-3">
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
              >
                Nyt klip
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {selectedMatch ? (
            <div className="space-y-3">
              <div ref={playerWrapRef} className={"relative " + (isFullscreen ? "bg-black" : "")}> 
                <YouTubeEditorPlayer
                  videoUrl={selectedMatch.videoUrl}
                  playerRef={playerRef}
                  overlay={
                    canEdit ? (
                      <OverlayCanvas
                        currentSec={currentSec}
                        clipStart={clipStart!}
                        clipEnd={clipEnd!}
                        overlays={overlays}
                        setOverlays={setOverlays}
                        tool={overlayTool}
                        color={overlayColor}
                        strokeWidth={overlayStrokeWidth}
                        size={overlaySize}
                        arrowKind={arrowKind}
                        arrowStyle={arrowStyle}
                        stickerId={stickerId}
                        selectedId={selectedOverlayId}
                        onSelect={setSelectedOverlayId}
                        onBeginEdit={beginEdit}
                        onEndEdit={endEdit}
                      />
                    ) : null
                  }
                />
              </div>

              {canEdit ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white p-3">
                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={() => seekRel(-3)}
                  >
                    ◀︎ 3s
                  </button>

                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    onClick={undo}
                    disabled={!canUndo}
                    title="Undo"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    onClick={redo}
                    disabled={!canRedo}
                    title="Redo"
                  >
                    Redo
                  </button>

                  <button
                    type="button"
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
                    onClick={playClip}
                    disabled={playing}
                  >
                    Play
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={pauseClip}
                    disabled={!playing}
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={() => seekRel(3)}
                  >
                    3s ▶︎
                  </button>

                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={() => void toggleFullscreen()}
                  >
                    {isFullscreen ? "Afslut fuldskærm" : "Fuldskærm"}
                  </button>

                  <div className="w-full sm:w-auto sm:flex-1" />

                  <label className="flex items-center gap-2 text-sm">
                    Pause (s)
                    <input
                      className="w-16 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                      value={pauseDurationInput}
                      onChange={(e) => setPauseDurationInput(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <button
                    type="button"
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold"
                    onClick={addPause}
                  >
                    Tilføj pause
                  </button>

                  {selectedOverlay ? (
                    <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm">
                      <span className="text-xs font-semibold">Valgt:</span>
                      <span className="text-xs">{selectedOverlay.type.toUpperCase()}</span>
                      <span className="mx-1 h-4 w-px bg-zinc-200" />
                      {selectedOverlay.type === "text" || selectedOverlay.type === "sticker" || selectedOverlay.type === "circle" ? (
                        <label className="flex items-center gap-2 text-xs">
                          Størrelse
                          <input
                            className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                            value={selectedOverlaySizeInput}
                            onChange={(e) => setSelectedOverlaySizeInput(e.target.value)}
                            onBlur={() => applySelectedOverlaySize(Number(selectedOverlaySizeInput) || 1)}
                            inputMode="numeric"
                          />
                        </label>
                      ) : null}

                      {selectedOverlay.type === "arrow" || selectedOverlay.type === "circle" || selectedOverlay.type === "pen" ? (
                        <label className="flex items-center gap-2 text-xs">
                          Tykkelse
                          <input
                            className="w-20 rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                            value={selectedOverlayWidthInput}
                            onChange={(e) => setSelectedOverlayWidthInput(e.target.value)}
                            onBlur={() => applySelectedOverlayWidth(Number(selectedOverlayWidthInput) || 1)}
                            inputMode="numeric"
                          />
                        </label>
                      ) : null}

                      {selectedOverlay.type === "arrow" ? (
                        <label className="flex items-center gap-2 text-xs">
                          Stil
                          <select
                            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm"
                            value={String((selectedOverlay as any).style ?? "solid")}
                            onChange={(e) => {
                              beginEdit();
                              applySelectedArrowStyle(e.target.value as any);
                            }}
                            onBlur={() => endEdit()}
                          >
                            <option value="solid">Solid</option>
                            <option value="dashed">Stiplet</option>
                            <option value="wavy">Bølget</option>
                          </select>
                        </label>
                      ) : null}

                      <label className="flex items-center gap-2 text-xs">
                        Farve
                        <input
                          className="h-8 w-10 rounded-md border border-zinc-200 bg-white p-1"
                          type="color"
                          value={selectedOverlayColorInput || selectedOverlay.color}
                          onChange={(e) => {
                            beginEdit();
                            setSelectedOverlayColorInput(e.target.value);
                            applySelectedOverlayColor(e.target.value);
                          }}
                          onBlur={() => endEdit()}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canEdit ? (
                <TimelineEditor
                  clipStart={clipStart!}
                  clipEnd={clipEnd!}
                  currentClipSec={currentClipSec}
                  pauses={pauses}
                  setPauses={setPauses}
                  overlays={overlays}
                  setOverlays={setOverlays}
                  selectedOverlayId={selectedOverlayId}
                  setSelectedOverlayId={setSelectedOverlayId}
                  onSeekClip={onSeekClip}
                  setClipStart={setClipStartAbs}
                  setClipEnd={setClipEndAbs}
                  onBeginEdit={beginEdit}
                  onEndEdit={endEdit}
                />
              ) : null}

              {canEdit ? (
                <div className="space-y-2">
                  <OverlayToolbar
                    tool={overlayTool}
                    setTool={setOverlayTool}
                    color={overlayColor}
                    setColor={setOverlayColor}
                    strokeWidth={overlayStrokeWidth}
                    setStrokeWidth={setOverlayStrokeWidth}
                    size={overlaySize}
                    setSize={setOverlaySize}
                    arrowKind={arrowKind}
                    setArrowKind={setArrowKind}
                    arrowStyle={arrowStyle}
                    setArrowStyle={setArrowStyle}
                  />

                  {overlayTool === "sticker" ? (
                    <StickerPicker value={stickerId} onChange={setStickerId} color={overlayColor} />
                  ) : null}

                  {overlays.length > 0 ? (
                    <OverlayList
                      overlays={overlays}
                      onDelete={deleteOverlay}
                      selectedId={selectedOverlayId}
                      onSelect={setSelectedOverlayId}
                    />
                  ) : null}
                </div>
              ) : (
                <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
                  Tryk “Start optagelse”, spil videoen til ønsket tidspunkt, og tryk “Stop optagelse”.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
              Ingen kampe fundet. Opret en kamp under Kampe først.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
