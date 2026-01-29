"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStatsFilters } from "@/components/stats/StatsFiltersProvider";

type StatsFile = {
  id: string;
  kind: "EVENTS" | "PLAYERS";
  originalName: string;
  createdAt: string;
  gameId: string | null;
  gameDate: string | null;
  competition: string | null;
};

type StatsEvent = {
  id: string;
  timestamp: string | null;
  period: number | null;
  event: string;
  perspective?: string | null;
  strength?: string | null;
  goalieName?: string | null;
  gNo?: number | null;
  teamName?: string | null;
  teamHome?: string | null;
  teamAway?: string | null;
  homePlayersNames?: string | null;
  awayPlayersNames?: string | null;
  p1No: number | null;
  p1Name: string | null;
  p2No: number | null;
  p2Name: string | null;
  xM: number | null;
  yM: number | null;
  gameId: string | null;
  gameDate?: string | null;
  competition: string | null;
  file: { id: string; originalName: string; createdAt: string };
};

type TabKey = "events" | "shotmap" | "heatmap" | "tabeller" | "video";

type ShotKind = "GOAL" | "SHOT" | "MISS" | "BLOCK" | "PENALTY";

function classifyShotKind(event: string): ShotKind {
  const e = String(event ?? "").trim().toLowerCase();
  if (e.includes("goal")) return "GOAL";
  if (e.includes("miss")) return "MISS";
  if (e.includes("block")) return "BLOCK";
  if (e.includes("penalty")) return "PENALTY";
  return "SHOT";
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toHalfRinkPoint(
  xM: number,
  yM: number,
  half: "left" | "right"
): { x: number; y: number } | null {
  // Data uses center-origin meters: x in [-20,20], y in [-10,10]
  // Each half-rink displays x in [-20,0] (left) or [0,20] (right), normalized to [0,1]
  const x = clamp(xM, -20, 20);
  const y = clamp(yM, -10, 10);

  if (half === "left") {
    if (x > 0) return null;
    return { x: (x + 20) / 20, y: (y + 10) / 20 };
  }

  if (x < 0) return null;
  return { x: x / 20, y: (y + 10) / 20 };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(t: number) {
  return clamp(t, 0, 1);
}

function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16);
    const g = parseInt(h[1] + h[1], 16);
    const b = parseInt(h[2] + h[2], 16);
    return { r, g, b };
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function mixRgb(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  const tt = clamp01(t);
  return {
    r: Math.round(lerp(a.r, b.r, tt)),
    g: Math.round(lerp(a.g, b.g, tt)),
    b: Math.round(lerp(a.b, b.b, tt)),
  };
}

function rgbCss(c: { r: number; g: number; b: number }) {
  return `rgb(${c.r} ${c.g} ${c.b})`;
}

function colorScaleRedWhiteBlue(value: number, low: number, mid: number, high: number) {
  // Requested colors: red at low, white at mid, blue at high.
  const red = hexToRgb("#ef4444");
  const white = hexToRgb("#ffffff");
  const blue = hexToRgb("#3b82f6");

  if (!Number.isFinite(value)) return rgbCss(white);
  if (value <= mid) {
    const t = (value - low) / Math.max(1e-9, mid - low);
    return rgbCss(mixRgb(red, white, t));
  }
  const t = (value - mid) / Math.max(1e-9, high - mid);
  return rgbCss(mixRgb(white, blue, t));
}

function pct(n: number) {
  return Math.round(n * 10) / 10;
}

function ShotMarker({
  kind,
  x,
  y,
  color,
}: {
  kind: ShotKind;
  x: number;
  y: number;
  color: string;
}) {
  const cx = x * 100;
  const cy = y * 100;
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    vectorEffect: "non-scaling-stroke" as const,
  };

  // Marker sizing in viewBox units (0..100)
  const r = 1.3;
  const s = 2.6;

  switch (kind) {
    case "SHOT":
      return <circle cx={cx} cy={cy} r={r} {...common} />;
    case "MISS":
      return (
        <polygon
          points={`${cx},${cy - s / 1.6} ${cx - s / 1.4},${cy + s / 2} ${cx + s / 1.4},${cy + s / 2}`}
          {...common}
        />
      );
    case "BLOCK":
      return <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={0.2} {...common} />;
    case "PENALTY":
      return (
        <polygon
          points={`${cx},${cy - s / 1.6} ${cx - s / 1.6},${cy} ${cx},${cy + s / 1.6} ${cx + s / 1.6},${cy}`}
          {...common}
        />
      );
    case "GOAL":
    default:
      // 5-point star
      return (
        <path
          d={`M 0,-2.6 L 0.8,-0.8 L 2.6,-0.8 L 1.1,0.3 L 1.6,2.2 L 0,1.1 L -1.6,2.2 L -1.1,0.3 L -2.6,-0.8 L -0.8,-0.8 Z`}
          transform={`translate(${cx} ${cy})`}
          {...common}
        />
      );
  }
}

function KpiCard({
  title,
  leftLabel,
  midLabel,
  rightLabel,
  leftValue,
  midValue,
  rightValue,
  midBg,
}: {
  title: string;
  leftLabel: string;
  midLabel: string;
  rightLabel: string;
  leftValue: string;
  midValue: string;
  rightValue: string;
  midBg: string;
}) {
  return (
    <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-4">
      <div className="text-center text-lg font-semibold">{title}</div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-2 text-center">
          <div className="text-xs text-zinc-500">{leftLabel}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{leftValue}</div>
        </div>
        <div className="rounded-md border border-[color:var(--surface-border)] p-2 text-center" style={{ background: midBg }}>
          <div className="text-xs text-zinc-700">{midLabel}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">{midValue}</div>
        </div>
        <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-2 text-center">
          <div className="text-xs text-zinc-500">{rightLabel}</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{rightValue}</div>
        </div>
      </div>
    </div>
  );
}

function HalfRink({
  title,
  half,
  events,
  selectedTeam,
  flipByPeriod,
}: {
  title: string;
  half: "left" | "right";
  events: StatsEvent[];
  selectedTeam: string;
  flipByPeriod: Map<number, boolean>;
}) {
  const selected = String(selectedTeam ?? "").trim();
  const offenseColor = "var(--brand)";
  const defenseColor = "var(--surface-foreground)";

  const points = useMemo(() => {
    const out: Array<{
      id: string;
      kind: ShotKind;
      x: number;
      y: number;
      color: string;
    }> = [];

    for (const e of events) {
      if (!isFiniteNumber(e.xM) || !isFiniteNumber(e.yM)) continue;

      const periodKey = e.period ?? 0;
      const flip = flipByPeriod.get(periodKey) ?? false;
      const xAdj = flip ? -e.xM : e.xM;
      const yAdj = flip ? -e.yM : e.yM;

      const p = toHalfRinkPoint(xAdj, yAdj, half);
      if (!p) continue;

      const isOffense = String(e.teamName ?? "").trim() === selected;
      out.push({
        id: e.id,
        kind: classifyShotKind(e.event),
        x: p.x,
        y: p.y,
        color: isOffense ? offenseColor : defenseColor,
      });
    }

    return out;
  }, [events, half, selected]);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-zinc-600">{title}</div>
      <div className="relative overflow-hidden rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)]">
        <div className="relative aspect-[1/1] w-full">
          <img
            src="/bane.png"
            alt="Bane"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: half === "left" ? "left center" : "right center" }}
          />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {points.map((p) => (
              <ShotMarker key={p.id} kind={p.kind} x={p.x} y={p.y} color={p.color} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function StatistikClient({ isLeader }: { isLeader: boolean }) {
  const [tab, setTab] = useState<TabKey>("events");

  const { filters } = useStatsFilters();

  const eventsFileInputRef = useRef<HTMLInputElement | null>(null);
  const playersFileInputRef = useRef<HTMLInputElement | null>(null);

  const [events, setEvents] = useState<StatsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [eventFiles, setEventFiles] = useState<StatsFile[]>([]);
  const [playerFiles, setPlayerFiles] = useState<StatsFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);

  const [uploading, setUploading] = useState<"EVENTS" | "PLAYERS" | null>(null);

  const tabs = useMemo(
    () =>
      [
        { key: "events" as const, label: "Events" },
        { key: "shotmap" as const, label: "Shot Map" },
        { key: "heatmap" as const, label: "Heat Map" },
        { key: "tabeller" as const, label: "Tabeller" },
        { key: "video" as const, label: "Video" },
      ],
    []
  );

  async function loadEvents() {
    setEventsLoading(true);
    setEventsError(null);

    try {
      const res = await fetch("/api/stats/events?limit=1000", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEvents([]);
        setEventsError(data?.message ?? "Kunne ikke hente events.");
        return;
      }

      setEvents(data?.events ?? []);
    } finally {
      setEventsLoading(false);
    }
  }

  async function loadFiles() {
    if (!isLeader) return;

    setFilesLoading(true);
    setFilesError(null);

    try {
      const [eventsRes, playersRes] = await Promise.all([
        fetch("/api/stats/files?kind=EVENTS", { cache: "no-store" }),
        fetch("/api/stats/files?kind=PLAYERS", { cache: "no-store" }),
      ]);

      const eventsData = await eventsRes.json().catch(() => ({}));
      const playersData = await playersRes.json().catch(() => ({}));

      if (!eventsRes.ok || !playersRes.ok) {
        setEventFiles([]);
        setPlayerFiles([]);
        setFilesError(
          eventsData?.message ?? playersData?.message ?? "Kunne ikke hente filer."
        );
        return;
      }

      setEventFiles(eventsData?.files ?? []);
      setPlayerFiles(playersData?.files ?? []);
    } finally {
      setFilesLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFiles(kind: "EVENTS" | "PLAYERS", files: FileList | File[]) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;

    setUploading(kind);
    setEventsError(null);
    setFilesError(null);

    try {
      for (const file of list) {
        const form = new FormData();
        form.set("kind", kind);
        form.set("file", file);

        const res = await fetch("/api/stats/upload", {
          method: "POST",
          body: form,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = data?.message ?? `Upload fejlede (${file.name}).`;
          setEventsError(msg);
          return;
        }
      }

      await Promise.all([loadEvents(), loadFiles()]);
    } finally {
      setUploading(null);
    }
  }

  async function deleteFile(fileId: string) {
    setFilesError(null);

    const res = await fetch(`/api/stats/files/${fileId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setFilesError(data?.message ?? "Kunne ikke slette fil.");
      return;
    }

    await Promise.all([loadEvents(), loadFiles()]);
  }

  function norm(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
  }

  function splitOnIce(value: string | null | undefined) {
    return String(value ?? "")
      .split(" - ")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const filteredEvents = useMemo(() => {
    const pSel = norm(filters.perspektiv);
    const gameSel = norm(filters.kamp);
    const playerSel = norm(filters.spiller);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    if (!pSel) return [];

    return events.filter((e) => {
      if (norm(e.teamName ?? e.perspective) !== pSel) return false;

      if (gameSel && norm(e.gameId) !== gameSel) return false;

      if (goalieSel && norm(e.goalieName) !== goalieSel) return false;

      if (playerSel) {
        const matches =
          norm(e.p1Name) === playerSel ||
          norm(e.p2Name) === playerSel;
        if (!matches) return false;
      }

      if (onIceSel.length > 0) {
        const names = new Set(
          [...splitOnIce(e.homePlayersNames), ...splitOnIce(e.awayPlayersNames)].map((n) =>
            norm(n)
          )
        );
        for (const name of onIceSel) if (!names.has(name)) return false;
      }

      return true;
    });
  }, [events, filters]);

  const shotMapEvents = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam) return [];

    const gameSel = norm(filters.kamp);
    const playerSel = norm(filters.spiller);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    return events.filter((e) => {
      // Only show shot-like events on the map
      void classifyShotKind(e.event);

      if (gameSel && norm(e.gameId) !== gameSel) return false;
      if (goalieSel && norm(e.goalieName) !== goalieSel) return false;

      if (playerSel) {
        const matches = norm(e.p1Name) === playerSel || norm(e.p2Name) === playerSel;
        if (!matches) return false;
      }

      if (onIceSel.length > 0) {
        const names = new Set(
          [...splitOnIce(e.homePlayersNames), ...splitOnIce(e.awayPlayersNames)].map((n) => norm(n))
        );
        for (const name of onIceSel) if (!names.has(name)) return false;
      }

      // Require coordinates
      if (!isFiniteNumber(e.xM) || !isFiniteNumber(e.yM)) return false;
      return true;
    });
  }, [events, filters]);

  const shotMapFlipByPeriod = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    const sums = new Map<number, number>();
    for (const e of shotMapEvents) {
      if (String(e.teamName ?? "").trim() !== selectedTeam) continue;
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;
      const periodKey = e.period ?? 0;
      sums.set(periodKey, (sums.get(periodKey) ?? 0) + (e.xM ?? 0));
    }

    const flip = new Map<number, boolean>();
    for (const [p, sumX] of sums.entries()) {
      flip.set(p, sumX < 0);
    }
    return flip;
  }, [shotMapEvents, filters.perspektiv]);

  const shotMapKpis = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam) return null;

    const isFor = (e: StatsEvent) => String(e.teamName ?? "").trim() === selectedTeam;

    let corsiFor = 0;
    let corsiAgainst = 0;
    let fenwickFor = 0;
    let fenwickAgainst = 0;
    let shotsFor = 0;
    let shotsAgainst = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const e of shotMapEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;
      const forTeam = isFor(e);

      const isCorsi = kind === "GOAL" || kind === "SHOT" || kind === "MISS" || kind === "BLOCK";
      const isFenwick = kind === "GOAL" || kind === "SHOT" || kind === "MISS";
      const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
      const isGoal = kind === "GOAL";

      if (isCorsi) {
        if (forTeam) corsiFor++;
        else corsiAgainst++;
      }
      if (isFenwick) {
        if (forTeam) fenwickFor++;
        else fenwickAgainst++;
      }
      if (isShotOnGoal) {
        if (forTeam) shotsFor++;
        else shotsAgainst++;
      }
      if (isGoal) {
        if (forTeam) goalsFor++;
        else goalsAgainst++;
      }
    }

    const pctShare = (f: number, a: number) => {
      const den = f + a;
      return den > 0 ? (f / den) * 100 : 0;
    };

    const cfPct = pctShare(corsiFor, corsiAgainst);
    const ffPct = pctShare(fenwickFor, fenwickAgainst);
    const sfPct = pctShare(shotsFor, shotsAgainst);
    const gfPct = pctShare(goalsFor, goalsAgainst);

    const svPct = shotsAgainst > 0 ? ((shotsAgainst - goalsAgainst) / shotsAgainst) * 100 : 0;
    const shPct = shotsFor > 0 ? (goalsFor / shotsFor) * 100 : 0;
    const pdo = svPct + shPct;

    return {
      corsi: { ca: corsiAgainst, cfPct, cf: corsiFor },
      fenwick: { fa: fenwickAgainst, ffPct, ff: fenwickFor },
      shots: { sa: shotsAgainst, sfPct, sf: shotsFor },
      goals: { ga: goalsAgainst, gfPct, gf: goalsFor },
      sg: { svPct, pdo, shPct },
    };
  }, [shotMapEvents, filters.perspektiv]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Statistik</h1>
      </header>

      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)]"
                : "rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm"
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "events" ? (
        <section className="space-y-6">
          {isLeader ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-[color:var(--surface-border)] p-4">
                <h2 className="text-lg font-semibold">Upload Events (CSV)</h2>

                <div className="mt-3 flex flex-col gap-2">
                  <input
                    ref={eventsFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    multiple
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files) void uploadFiles("EVENTS", files);
                      e.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading === "EVENTS"}
                    onClick={() => eventsFileInputRef.current?.click()}
                    className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Filer</h3>
                    <button
                      type="button"
                      onClick={loadFiles}
                      disabled={filesLoading}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                    >
                      Opdater
                    </button>
                  </div>

                  {eventFiles.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-600">Ingen filer.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {eventFiles.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-2"
                        >
                          <div className="min-w-0 text-sm">
                            <div className="truncate font-medium">{f.originalName}</div>
                            <div className="text-xs text-zinc-600">
                              {new Date(f.createdAt).toLocaleString("da-DK")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteFile(f.id)}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                          >
                            Slet
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-[color:var(--surface-border)] p-4">
                <h2 className="text-lg font-semibold">Upload Players (CSV)</h2>

                <div className="mt-3 flex flex-col gap-2">
                  <input
                    ref={playersFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    multiple
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files) void uploadFiles("PLAYERS", files);
                      e.currentTarget.value = "";
                    }}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={uploading === "PLAYERS"}
                    onClick={() => playersFileInputRef.current?.click()}
                    className="w-fit rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    Upload
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Filer</h3>
                    <button
                      type="button"
                      onClick={loadFiles}
                      disabled={filesLoading}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                    >
                      Opdater
                    </button>
                  </div>

                  {playerFiles.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-600">Ingen filer.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {playerFiles.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 p-2"
                        >
                          <div className="min-w-0 text-sm">
                            <div className="truncate font-medium">{f.originalName}</div>
                            <div className="text-xs text-zinc-600">
                              {new Date(f.createdAt).toLocaleString("da-DK")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteFile(f.id)}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs"
                          >
                            Slet
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {filesError ? <p className="text-sm text-red-600">{filesError}</p> : null}
            </div>
          ) : null}

          <div className="rounded-md border border-[color:var(--surface-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Events</h2>
              <button
                type="button"
                onClick={loadEvents}
                disabled={eventsLoading}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Opdater
              </button>
            </div>

            {eventsError ? <p className="mt-2 text-sm text-red-600">{eventsError}</p> : null}

            {filteredEvents.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
            ) : (
              <div className="mt-4 max-h-[60vh] overflow-auto">
                <table className="min-w-[900px] w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[color:var(--surface)]">
                    <tr className="border-b border-[color:var(--surface-border)] text-left">
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Tid</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Periode</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Event</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">P1</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">P2</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">X</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Y</th>
                      <th className="bg-[color:var(--surface)] py-2 pr-3">Fil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map((e) => (
                      <tr key={e.id} className="border-b border-[color:var(--surface-border)]">
                        <td className="py-2 pr-3">
                          {e.timestamp
                            ? new Date(e.timestamp).toLocaleString("da-DK")
                            : "-"}
                        </td>
                        <td className="py-2 pr-3">{e.period ?? "-"}</td>
                        <td className="py-2 pr-3 font-medium">{e.event}</td>
                        <td className="py-2 pr-3">
                          {e.p1No ?? ""}{e.p1Name ? ` ${e.p1Name}` : ""}
                        </td>
                        <td className="py-2 pr-3">
                          {e.p2No ?? ""}{e.p2Name ? ` ${e.p2Name}` : ""}
                        </td>
                        <td className="py-2 pr-3">{e.xM ?? "-"}</td>
                        <td className="py-2 pr-3">{e.yM ?? "-"}</td>
                        <td className="py-2 pr-3 text-xs text-zinc-600">
                          {e.file?.originalName ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : tab === "shotmap" ? (
        <section className="space-y-6">
          <div className="rounded-md border border-[color:var(--surface-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Shot Map</h2>
              <button
                type="button"
                onClick={loadEvents}
                disabled={eventsLoading}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Opdater
              </button>
            </div>

            {eventsError ? (
              <p className="mt-2 text-sm text-red-600">{eventsError}</p>
            ) : null}

            {String(filters.perspektiv ?? "").trim().length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Vælg et Perspektiv.</p>
            ) : shotMapEvents.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_280px_1fr] md:items-start">
                <HalfRink
                  title="Defensive End"
                  half="left"
                  events={shotMapEvents}
                  selectedTeam={String(filters.perspektiv ?? "").trim()}
                  flipByPeriod={shotMapFlipByPeriod}
                />

                <div className="space-y-3">
                  {shotMapKpis ? (
                    <>
                      <KpiCard
                        title="Corsi"
                        leftLabel="CA"
                        midLabel="CF%"
                        rightLabel="CF"
                        leftValue={String(shotMapKpis.corsi.ca)}
                        midValue={String(pct(shotMapKpis.corsi.cfPct))}
                        rightValue={String(shotMapKpis.corsi.cf)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.corsi.cfPct, 20, 50, 80)}
                      />
                      <KpiCard
                        title="Fenwick"
                        leftLabel="FA"
                        midLabel="FF%"
                        rightLabel="FF"
                        leftValue={String(shotMapKpis.fenwick.fa)}
                        midValue={String(pct(shotMapKpis.fenwick.ffPct))}
                        rightValue={String(shotMapKpis.fenwick.ff)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.fenwick.ffPct, 20, 50, 80)}
                      />
                      <KpiCard
                        title="Shots"
                        leftLabel="SA"
                        midLabel="SF%"
                        rightLabel="SF"
                        leftValue={String(shotMapKpis.shots.sa)}
                        midValue={String(pct(shotMapKpis.shots.sfPct))}
                        rightValue={String(shotMapKpis.shots.sf)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.shots.sfPct, 20, 50, 80)}
                      />
                      <KpiCard
                        title="Goals"
                        leftLabel="GA"
                        midLabel="GF%"
                        rightLabel="GF"
                        leftValue={String(shotMapKpis.goals.ga)}
                        midValue={String(pct(shotMapKpis.goals.gfPct))}
                        rightValue={String(shotMapKpis.goals.gf)}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.goals.gfPct, 20, 50, 80)}
                      />
                      <KpiCard
                        title="Shooting / Goaltending"
                        leftLabel="Sv%"
                        midLabel="PDO"
                        rightLabel="Sh%"
                        leftValue={String(pct(shotMapKpis.sg.svPct))}
                        midValue={String(pct(shotMapKpis.sg.pdo))}
                        rightValue={String(pct(shotMapKpis.sg.shPct))}
                        midBg={colorScaleRedWhiteBlue(shotMapKpis.sg.pdo, 90, 100, 110)}
                      />
                    </>
                  ) : null}
                </div>

                <HalfRink
                  title="Offensive End"
                  half="right"
                  events={shotMapEvents}
                  selectedTeam={String(filters.perspektiv ?? "").trim()}
                  flipByPeriod={shotMapFlipByPeriod}
                />
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm text-zinc-700">
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full border-2 border-[color:var(--surface-foreground)]" />
                <span>Shot</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-0 w-0 border-l-[7px] border-r-[7px] border-b-[12px] border-l-transparent border-r-transparent border-b-[color:var(--surface-foreground)]" />
                <span>Miss</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 border-2 border-[color:var(--surface-foreground)]" />
                <span>Block</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rotate-45 border-2 border-[color:var(--surface-foreground)]" />
                <span>Penalty</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base text-[color:var(--surface-foreground)]">★</span>
                <span>Goal</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-md border border-[color:var(--surface-border)] p-4">
          <h2 className="text-lg font-semibold">
            {tabs.find((t) => t.key === tab)?.label}
          </h2>
          <p className="mt-2 text-sm text-zinc-600">Kommer snart.</p>
        </section>
      )}
    </div>
  );
}
