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

type StatsPlayerSummary = {
  id: string;
  number: number | null;
  name: string | null;
  line: string | null;
  teamName: string | null;
  teamColor: string | null;
  gameId: string | null;
};

type ShotKind = "GOAL" | "SHOT" | "MISS" | "BLOCK" | "PENALTY";

type ZonesGeoJson = {
  type: "FeatureCollection";
  features: ZoneFeature[];
};

type ZoneFeature = {
  type: "Feature";
  properties: { id: string; side: "O" | "D" };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
};

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

type ShotMapKpis = {
  corsi: { ca: number; cfPct: number; cf: number };
  fenwick: { fa: number; ffPct: number; ff: number };
  shots: { sa: number; sfPct: number; sf: number };
  goals: { ga: number; gfPct: number; gf: number };
  sg: { svPct: number; pdo: number; shPct: number };
};

function computeShotMapKpis(events: StatsEvent[], selectedTeam: string): ShotMapKpis {
  const sel = String(selectedTeam ?? "").trim();
  const isFor = (e: StatsEvent) => String(e.teamName ?? "").trim() === sel;

  let corsiFor = 0;
  let corsiAgainst = 0;
  let fenwickFor = 0;
  let fenwickAgainst = 0;
  let shotsFor = 0;
  let shotsAgainst = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const e of events) {
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
}

function pct(n: number) {
  return Math.round(n * 10) / 10;
}

function pointInPolygon(x: number, y: number, ring: number[][]) {
  // Ray-casting algorithm. Assumes ring is closed or open (we handle both).
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!, yi = ring[i]![1]!;
    const xj = ring[j]![0]!, yj = ring[j]![1]!;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / Math.max(1e-9, yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonToSvgPath(
  ring: number[][],
  half: "left" | "right"
): { d: string; cx: number; cy: number } | null {
  const pts: Array<{ x: number; y: number }> = [];
  for (const p of ring) {
    const mapped = toHalfRinkPoint(p[0]!, p[1]!, half);
    if (!mapped) return null;
    pts.push({ x: mapped.x * 100, y: mapped.y * 100 });
  }
  if (pts.length === 0) return null;

  // Centroid of polygon (area-weighted). Falls back to vertex-average for degenerate polygons.
  const ptsForCentroid =
    pts.length > 2 && pts[0]!.x === pts[pts.length - 1]!.x && pts[0]!.y === pts[pts.length - 1]!.y
      ? pts.slice(0, -1)
      : pts;

  let area2 = 0;
  let cxAcc = 0;
  let cyAcc = 0;
  for (let i = 0; i < ptsForCentroid.length; i++) {
    const p0 = ptsForCentroid[i]!;
    const p1 = ptsForCentroid[(i + 1) % ptsForCentroid.length]!;
    const cross = p0.x * p1.y - p1.x * p0.y;
    area2 += cross;
    cxAcc += (p0.x + p1.x) * cross;
    cyAcc += (p0.y + p1.y) * cross;
  }

  const area = area2 / 2;
  const cx = Math.abs(area) > 1e-6 ? cxAcc / (6 * area) : pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = Math.abs(area) > 1e-6 ? cyAcc / (6 * area) : pts.reduce((s, p) => s + p.y, 0) / pts.length;

  const d =
    `M ${pts[0]!.x} ${pts[0]!.y} ` +
    pts
      .slice(1)
      .map((p) => `L ${p.x} ${p.y}`)
      .join(" ") +
    " Z";

  return { d, cx, cy };
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
  className,
}: {
  title: string;
  leftLabel: string;
  midLabel: string;
  rightLabel: string;
  leftValue: string;
  midValue: string;
  rightValue: string;
  midBg: string;
  className?: string;
}) {
  return (
    <div className={`rounded-md bg-[color:var(--surface)]/70 px-2.5 py-2 ${className ?? ""}`.trim()}>
      <div className="text-center text-sm font-semibold text-zinc-700">{title}</div>
      <div className="mt-1 grid grid-cols-3 gap-1">
        <div className="rounded-md bg-[color:var(--surface)] px-2 py-1 text-center">
          <div className="text-xs leading-4 text-zinc-500">{leftLabel}</div>
          <div className="text-base font-semibold tabular-nums">{leftValue}</div>
        </div>
        <div className="rounded-md px-2 py-1 text-center" style={{ background: midBg }}>
          <div className="text-xs leading-4 text-zinc-800">{midLabel}</div>
          <div className="text-base font-semibold tabular-nums text-zinc-900">{midValue}</div>
        </div>
        <div className="rounded-md bg-[color:var(--surface)] px-2 py-1 text-center">
          <div className="text-xs leading-4 text-zinc-500">{rightLabel}</div>
          <div className="text-base font-semibold tabular-nums">{rightValue}</div>
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
  teamColors,
}: {
  title: string;
  half: "left" | "right";
  events: StatsEvent[];
  selectedTeam: string;
  flipByPeriod: Map<number, boolean>;
  teamColors: Map<string, string>;
}) {
  const selected = String(selectedTeam ?? "").trim();
  const fallbackOffenseColor = "var(--brand)";
  const fallbackDefenseColor = "var(--surface-foreground)";

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

      const teamNameKey = String(e.teamName ?? "").trim();
      const mappedColor = teamNameKey ? teamColors.get(teamNameKey) : undefined;
      const color = mappedColor ?? (isOffense ? fallbackOffenseColor : fallbackDefenseColor);

      out.push({
        id: e.id,
        kind: classifyShotKind(e.event),
        x: p.x,
        y: p.y,
        color,
      });
    }

    return out;
  }, [events, half, selected, flipByPeriod, teamColors]);

  return (
    <div className="space-y-2">
      <div className="text-center text-base font-semibold text-zinc-600">{title}</div>
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

function HeatHalfRink({
  title,
  half,
  zones,
  fillByZoneId,
  labelByZoneId,
  selectedZoneCode,
  onSelectZone,
}: {
  title: string;
  half: "left" | "right";
  zones: ZoneFeature[];
  fillByZoneId: Map<string, string>;
  labelByZoneId: Map<string, number>;
  selectedZoneCode: string | null;
  onSelectZone: (zoneId: string) => void;
}) {
  const side: "O" | "D" = half === "right" ? "O" : "D";

  const paths = useMemo(() => {
    return zones
      .filter((z) => z.properties.side === side)
      .map((z) => {
        const ring = z.geometry.coordinates?.[0];
        if (!ring || ring.length < 3) return null;
        const path = polygonToSvgPath(ring, half);
        if (!path) return null;
        return { id: z.properties.id, d: path.d, cx: path.cx, cy: path.cy };
      })
      .filter((x): x is { id: string; d: string; cx: number; cy: number } => Boolean(x));
  }, [zones, side, half]);

  return (
    <div className="space-y-2">
      <div className="text-center text-base font-semibold text-zinc-600">{title}</div>
      <div className="relative overflow-hidden rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)]">
        <div className="relative aspect-[1/1] w-full">
          <img
            src="/bane.png"
            alt="Bane"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: half === "left" ? "left center" : "right center" }}
          />

          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {paths.map((p) => (
              <g key={p.id} className="cursor-pointer">
                <path
                  d={p.d}
                  fill={fillByZoneId.get(p.id) ?? "transparent"}
                  stroke={
                    selectedZoneCode && p.id.slice(1) === selectedZoneCode
                      ? "rgba(250,204,21,.95)"
                      : "rgba(255,255,255,.25)"
                  }
                  strokeWidth={selectedZoneCode && p.id.slice(1) === selectedZoneCode ? 1.4 : 0.6}
                  vectorEffect="non-scaling-stroke"
                  onClick={() => onSelectZone(p.id)}
                />
                <text
                  x={p.cx}
                  y={p.cy}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(0,0,0,.55)"
                  fontSize={5}
                  style={{ pointerEvents: "none" }}
                >
                  {String(labelByZoneId.get(p.id) ?? 0)}
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

export default function StatistikClient({ isLeader }: { isLeader: boolean }) {
  const [tab, setTab] = useState<TabKey>("events");

  type TablesTabKey = "players-individual" | "players-onice" | "goalies" | "team";
  const [tablesTab, setTablesTab] = useState<TablesTabKey>("players-individual");

  const [selectedZoneCode, setSelectedZoneCode] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneFeature[] | null>(null);
  const [zonesError, setZonesError] = useState<string | null>(null);

  const { filters } = useStatsFilters();

  const eventsFileInputRef = useRef<HTMLInputElement | null>(null);
  const playersFileInputRef = useRef<HTMLInputElement | null>(null);

  const [events, setEvents] = useState<StatsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [players, setPlayers] = useState<StatsPlayerSummary[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    async function loadZones() {
      try {
        const res = await fetch("/zones.json");
        if (!res.ok) throw new Error("Kunne ikke hente zones.json");
        const json = (await res.json()) as ZonesGeoJson;
        if (!cancelled) setZones(Array.isArray(json?.features) ? json.features : null);
      } catch (e) {
        if (!cancelled) setZonesError(e instanceof Error ? e.message : "Kunne ikke hente zoner.");
      }
    }

    void loadZones();
    return () => {
      cancelled = true;
    };
  }, []);

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
    void loadPlayers();
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPlayers() {
    try {
      const res = await fetch("/api/stats/players", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlayers([]);
        return;
      }
      setPlayers(data?.players ?? []);
    } catch {
      setPlayers([]);
    }
  }

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

  const selectedTeam = String(filters.perspektiv ?? "").trim();

  const tableEvents = useMemo(() => {
    // Base for tabeller: apply filter selections like game/strength/goalie/on-ice.
    // We intentionally do NOT require coordinates for tables.
    const gameSel = norm(filters.kamp);
    const strengthSel = norm(filters.styrke);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    return events.filter((e) => {
      if (gameSel && norm(e.gameId) !== gameSel) return false;
      if (strengthSel && norm(e.strength) !== strengthSel) return false;
      if (goalieSel && norm(e.goalieName) !== goalieSel) return false;

      if (onIceSel.length > 0) {
        const names = new Set(
          [...splitOnIce(e.homePlayersNames), ...splitOnIce(e.awayPlayersNames)].map((n) => norm(n))
        );
        for (const name of onIceSel) if (!names.has(name)) return false;
      }

      return true;
    });
  }, [events, filters]);

  const gameLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      if (!e.gameId) continue;
      if (map.has(e.gameId)) continue;
      const date = e.gameDate ? new Date(e.gameDate).toLocaleDateString("da-DK") : "";
      const homeAway = `${e.teamHome ?? ""} - ${e.teamAway ?? ""}`.trim();
      map.set(e.gameId, `${date} - ${homeAway}`.trim().replace(/^\s*-\s*/g, ""));
    }
    return map;
  }, [events]);

  const playerMetaByName = useMemo(() => {
    const map = new Map<string, { number: number | null; line: string | null }>();
    for (const p of players) {
      const n = String(p.name ?? "").trim();
      if (!n) continue;
      if (!map.has(n)) map.set(n, { number: p.number ?? null, line: p.line ?? null });
    }
    return map;
  }, [players]);

  const playerIndividualRows = useMemo(() => {
    if (!selectedTeam) return [];

    const byName = new Map<
      string,
      {
        name: string;
        number: number | null;
        line: string | null;
        g: number;
        a: number;
        sog: number;
        miss: number;
        block: number;
        attempts: number;
      }
    >();

    const ensure = (name: string) => {
      const meta = playerMetaByName.get(name) ?? { number: null, line: null };
      if (!byName.has(name)) {
        byName.set(name, { name, number: meta.number, line: meta.line, g: 0, a: 0, sog: 0, miss: 0, block: 0, attempts: 0 });
      }
      return byName.get(name)!;
    };

    for (const e of tableEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;

      const forTeam = String(e.teamName ?? "").trim() === selectedTeam;
      if (!forTeam) continue;

      const shooter = String(e.p1Name ?? "").trim();
      const assist = String(e.p2Name ?? "").trim();

      if (shooter) {
        const row = ensure(shooter);
        row.attempts += 1;
        if (kind === "GOAL") row.g += 1;
        if (kind === "GOAL" || kind === "SHOT") row.sog += 1;
        if (kind === "MISS") row.miss += 1;
        if (kind === "BLOCK") row.block += 1;
      }

      if (kind === "GOAL" && assist && assist !== shooter) {
        const row = ensure(assist);
        row.a += 1;
      }
    }

    const rows = Array.from(byName.values()).map((r) => ({ ...r, p: r.g + r.a }));
    rows.sort((a, b) => (b.p - a.p) || (b.attempts - a.attempts) || a.name.localeCompare(b.name, "da-DK"));
    return rows;
  }, [selectedTeam, playerMetaByName, tableEvents]);

  const playerOnIceRows = useMemo(() => {
    if (!selectedTeam) return [];

    const byName = new Map<
      string,
      {
        name: string;
        number: number | null;
        line: string | null;
        cf: number;
        ca: number;
        sf: number;
        sa: number;
        gf: number;
        ga: number;
      }
    >();

    const ensure = (name: string) => {
      const meta = playerMetaByName.get(name) ?? { number: null, line: null };
      if (!byName.has(name)) {
        byName.set(name, { name, number: meta.number, line: meta.line, cf: 0, ca: 0, sf: 0, sa: 0, gf: 0, ga: 0 });
      }
      return byName.get(name)!;
    };

    const normSel = norm(selectedTeam);

    for (const e of tableEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;

      const forTeam = String(e.teamName ?? "").trim() === selectedTeam;
      const isCorsi = kind === "GOAL" || kind === "SHOT" || kind === "MISS" || kind === "BLOCK";
      const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
      const isGoal = kind === "GOAL";

      const home = String(e.teamHome ?? "").trim();
      const away = String(e.teamAway ?? "").trim();
      let onIceList: string[] = [];
      if (norm(home) === normSel) onIceList = splitOnIce(e.homePlayersNames);
      else if (norm(away) === normSel) onIceList = splitOnIce(e.awayPlayersNames);

      if (onIceList.length === 0) continue;

      for (const name of onIceList) {
        const nm = String(name ?? "").trim();
        if (!nm) continue;
        const row = ensure(nm);
        if (isCorsi) {
          if (forTeam) row.cf += 1;
          else row.ca += 1;
        }
        if (isShotOnGoal) {
          if (forTeam) row.sf += 1;
          else row.sa += 1;
        }
        if (isGoal) {
          if (forTeam) row.gf += 1;
          else row.ga += 1;
        }
      }
    }

    const pctShare = (f: number, a: number) => {
      const den = f + a;
      return den > 0 ? (f / den) * 100 : 0;
    };

    const rows = Array.from(byName.values()).map((r) => {
      const cfPct = pctShare(r.cf, r.ca);
      const gfPct = pctShare(r.gf, r.ga);
      return { ...r, cfPct, gfPct };
    });

    rows.sort((a, b) => (b.cfPct - a.cfPct) || (b.cf - a.cf) || a.name.localeCompare(b.name, "da-DK"));
    return rows;
  }, [selectedTeam, playerMetaByName, tableEvents]);

  const goalieRows = useMemo(() => {
    if (!selectedTeam) return [];
    const byName = new Map<string, { name: string; games: number; sa: number; ga: number }>();
    const gamesByGoalie = new Map<string, Set<string>>();

    for (const e of tableEvents) {
      const goalie = String(e.goalieName ?? "").trim();
      if (!goalie) continue;

      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") continue;

      const against = String(e.teamName ?? "").trim() !== selectedTeam;
      if (!against) continue;

      const isShotOnGoal = kind === "GOAL" || kind === "SHOT";
      const isGoal = kind === "GOAL";

      if (!byName.has(goalie)) byName.set(goalie, { name: goalie, games: 0, sa: 0, ga: 0 });
      const row = byName.get(goalie)!;

      if (isShotOnGoal) row.sa += 1;
      if (isGoal) row.ga += 1;

      if (e.gameId) {
        if (!gamesByGoalie.has(goalie)) gamesByGoalie.set(goalie, new Set());
        gamesByGoalie.get(goalie)!.add(e.gameId);
      }
    }

    const rows = Array.from(byName.values()).map((r) => {
      const svPct = r.sa > 0 ? ((r.sa - r.ga) / r.sa) * 100 : 0;
      const games = gamesByGoalie.get(r.name)?.size ?? 0;
      return { ...r, games, svPct };
    });
    rows.sort((a, b) => (b.svPct - a.svPct) || (b.sa - a.sa) || a.name.localeCompare(b.name, "da-DK"));
    return rows;
  }, [selectedTeam, tableEvents]);

  const teamByGameRows = useMemo(() => {
    if (!selectedTeam) return [];

    const byGame = new Map<string, StatsEvent[]>();
    for (const e of tableEvents) {
      const gid = e.gameId ?? "(ukendt kamp)";
      if (!byGame.has(gid)) byGame.set(gid, []);
      byGame.get(gid)!.push(e);
    }

    const rows = Array.from(byGame.entries()).map(([gameId, list]) => {
      const k = computeShotMapKpis(list, selectedTeam);
      return {
        gameId,
        label: gameId === "(ukendt kamp)" ? "(ukendt kamp)" : (gameLabelById.get(gameId) ?? gameId),
        cf: k.corsi.cf,
        ca: k.corsi.ca,
        cfPct: k.corsi.cfPct,
        sf: k.shots.sf,
        sa: k.shots.sa,
        sfPct: k.shots.sfPct,
        gf: k.goals.gf,
        ga: k.goals.ga,
        gfPct: k.goals.gfPct,
      };
    });

    rows.sort((a, b) => a.label.localeCompare(b.label, "da-DK"));
    return rows;
  }, [selectedTeam, tableEvents, gameLabelById]);

  const filteredEvents = useMemo(() => {
    const pSel = norm(filters.perspektiv);
    const gameSel = norm(filters.kamp);
    const strengthSel = norm(filters.styrke);
    const playerSel = norm(filters.spiller);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    if (!pSel) return [];

    return events.filter((e) => {
      if (norm(e.teamName ?? e.perspective) !== pSel) return false;

      if (gameSel && norm(e.gameId) !== gameSel) return false;

      if (strengthSel && norm(e.strength) !== strengthSel) return false;

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
    const strengthSel = norm(filters.styrke);
    const playerSel = norm(filters.spiller);
    const goalieSel = norm(filters.maalmand);
    const onIceSel = filters.paaBanen.map((x) => norm(x)).filter(Boolean);

    return events.filter((e) => {
      // Only show shot-like events on the map
      void classifyShotKind(e.event);

      if (gameSel && norm(e.gameId) !== gameSel) return false;

      if (strengthSel && norm(e.strength) !== strengthSel) return false;
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

  const teamColors = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) {
      const name = String(p.teamName ?? "").trim();
      const color = String(p.teamColor ?? "").trim();
      if (!name || !color) continue;
      if (!map.has(name)) map.set(name, color);
    }
    return map;
  }, [players]);

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
    return computeShotMapKpis(shotMapEvents, selectedTeam);
  }, [shotMapEvents, filters.perspektiv]);

  const heatmap = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam || !zones) {
      return {
        fillByZoneId: new Map<string, string>(),
        labelByZoneId: new Map<string, number>(),
        zoneIdByEventId: new Map<string, string | null>(),
      };
    }

    const zonesO = zones.filter((z) => z.properties.side === "O");
    const zonesD = zones.filter((z) => z.properties.side === "D");

    const findZone = (x: number, y: number) => {
      const pool = x >= 0 ? zonesO : zonesD;
      for (const z of pool) {
        const ring = z.geometry.coordinates?.[0];
        if (!ring || ring.length < 3) continue;
        if (pointInPolygon(x, y, ring)) return z.properties.id;
      }
      return null;
    };

    const isFor = (e: StatsEvent) => String(e.teamName ?? "").trim() === selectedTeam;

    const zoneIdByEventId = new Map<string, string | null>();
    const forByZoneId = new Map<string, number>();
    const againstByZoneId = new Map<string, number>();
    for (const z of zones) {
      forByZoneId.set(z.properties.id, 0);
      againstByZoneId.set(z.properties.id, 0);
    }

    for (const e of shotMapEvents) {
      const kind = classifyShotKind(e.event);
      if (kind === "PENALTY") {
        zoneIdByEventId.set(e.id, null);
        continue;
      }
      if (!isFiniteNumber(e.xM) || !isFiniteNumber(e.yM)) {
        zoneIdByEventId.set(e.id, null);
        continue;
      }

      const periodKey = e.period ?? 0;
      const flip = shotMapFlipByPeriod.get(periodKey) ?? false;
      const xAdj = flip ? -e.xM : e.xM;
      const yAdj = flip ? -e.yM : e.yM;
      const zoneId = findZone(xAdj, yAdj);

      zoneIdByEventId.set(e.id, zoneId);
      if (!zoneId) continue;

      if (isFor(e)) {
        forByZoneId.set(zoneId, (forByZoneId.get(zoneId) ?? 0) + 1);
      } else {
        againstByZoneId.set(zoneId, (againstByZoneId.get(zoneId) ?? 0) + 1);
      }
    }

    // Display rule:
    // - Offensive end (Oxx): show Events For
    // - Defensive end (Dxx): show Events Against
    const labelByZoneId = new Map<string, number>();
    for (const z of zones) {
      const id = z.properties.id;
      const display = id.startsWith("O")
        ? (forByZoneId.get(id) ?? 0)
        : (againstByZoneId.get(id) ?? 0);
      labelByZoneId.set(id, display);
    }

    const values = [...labelByZoneId.values()].filter((n) => Number.isFinite(n));
    const max = values.length ? Math.max(...values) : 0;

    const fillByZoneId = new Map<string, string>();
    for (const [id, v] of labelByZoneId.entries()) {
      const a = max > 0 ? 0.12 + 0.78 * clamp01(v / max) : 0;
      fillByZoneId.set(id, `rgba(239,68,68,${a.toFixed(3)})`);
    }

    return { fillByZoneId, labelByZoneId, zoneIdByEventId };
  }, [filters.perspektiv, zones, shotMapEvents, shotMapFlipByPeriod]);

  const heatmapSelectedEvents = useMemo(() => {
    if (!selectedZoneCode) return shotMapEvents;
    const allow = new Set([`O${selectedZoneCode}`, `D${selectedZoneCode}`]);
    return shotMapEvents.filter((e) => {
      const zoneId = heatmap.zoneIdByEventId.get(e.id) ?? null;
      return zoneId ? allow.has(zoneId) : false;
    });
  }, [shotMapEvents, heatmap.zoneIdByEventId, selectedZoneCode]);

  const heatmapKpis = useMemo(() => {
    const selectedTeam = String(filters.perspektiv ?? "").trim();
    if (!selectedTeam) return null;
    return computeShotMapKpis(heatmapSelectedEvents, selectedTeam);
  }, [heatmapSelectedEvents, filters.perspektiv]);

  function onSelectZone(zoneId: string) {
    const code = String(zoneId ?? "").slice(1);
    if (!code) return;
    setSelectedZoneCode((cur) => (cur === code ? null : code));
  }

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
            {eventsError ? (
              <p className="mt-2 text-sm text-red-600">{eventsError}</p>
            ) : null}

            {String(filters.perspektiv ?? "").trim().length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Vælg et Perspektiv.</p>
            ) : shotMapEvents.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
            ) : (
              <div className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] md:items-stretch">
                <HalfRink
                  title="Defensive End"
                  half="left"
                  events={shotMapEvents}
                  selectedTeam={String(filters.perspektiv ?? "").trim()}
                  flipByPeriod={shotMapFlipByPeriod}
                  teamColors={teamColors}
                />

                <div className="flex h-full flex-col justify-between gap-2">
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
                        className="flex-1"
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
                        className="flex-1"
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
                        className="flex-1"
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
                        className="flex-1"
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
                        className="flex-1"
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
                  teamColors={teamColors}
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
      ) : tab === "heatmap" ? (
        <section className="space-y-6">
          <div className="rounded-md border border-[color:var(--surface-border)] p-4">
            {eventsError ? <p className="mt-2 text-sm text-red-600">{eventsError}</p> : null}

            {String(filters.perspektiv ?? "").trim().length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Vælg et Perspektiv.</p>
            ) : shotMapEvents.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-600">Ingen events.</p>
            ) : zonesError ? (
              <p className="mt-4 text-sm text-red-600">{zonesError}</p>
            ) : !zones ? (
              <p className="mt-4 text-sm text-zinc-600">Indlæser zoner…</p>
            ) : (
              <>
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)] md:items-stretch">
                  <HeatHalfRink
                    title="Defensive End"
                    half="left"
                    zones={zones}
                    fillByZoneId={heatmap.fillByZoneId}
                    labelByZoneId={heatmap.labelByZoneId}
                    selectedZoneCode={selectedZoneCode}
                    onSelectZone={onSelectZone}
                  />

                  <div className="flex h-full flex-col justify-between gap-2">
                    {heatmapKpis ? (
                      <>
                        <KpiCard
                          title="Corsi"
                          leftLabel="CA"
                          midLabel="CF%"
                          rightLabel="CF"
                          leftValue={String(heatmapKpis.corsi.ca)}
                          midValue={String(pct(heatmapKpis.corsi.cfPct))}
                          rightValue={String(heatmapKpis.corsi.cf)}
                          midBg={colorScaleRedWhiteBlue(heatmapKpis.corsi.cfPct, 20, 50, 80)}
                          className="flex-1"
                        />
                        <KpiCard
                          title="Fenwick"
                          leftLabel="FA"
                          midLabel="FF%"
                          rightLabel="FF"
                          leftValue={String(heatmapKpis.fenwick.fa)}
                          midValue={String(pct(heatmapKpis.fenwick.ffPct))}
                          rightValue={String(heatmapKpis.fenwick.ff)}
                          midBg={colorScaleRedWhiteBlue(heatmapKpis.fenwick.ffPct, 20, 50, 80)}
                          className="flex-1"
                        />
                        <KpiCard
                          title="Shots"
                          leftLabel="SA"
                          midLabel="SF%"
                          rightLabel="SF"
                          leftValue={String(heatmapKpis.shots.sa)}
                          midValue={String(pct(heatmapKpis.shots.sfPct))}
                          rightValue={String(heatmapKpis.shots.sf)}
                          midBg={colorScaleRedWhiteBlue(heatmapKpis.shots.sfPct, 20, 50, 80)}
                          className="flex-1"
                        />
                        <KpiCard
                          title="Goals"
                          leftLabel="GA"
                          midLabel="GF%"
                          rightLabel="GF"
                          leftValue={String(heatmapKpis.goals.ga)}
                          midValue={String(pct(heatmapKpis.goals.gfPct))}
                          rightValue={String(heatmapKpis.goals.gf)}
                          midBg={colorScaleRedWhiteBlue(heatmapKpis.goals.gfPct, 20, 50, 80)}
                          className="flex-1"
                        />
                        <KpiCard
                          title="Shooting / Goaltending"
                          leftLabel="Sv%"
                          midLabel="PDO"
                          rightLabel="Sh%"
                          leftValue={String(pct(heatmapKpis.sg.svPct))}
                          midValue={String(pct(heatmapKpis.sg.pdo))}
                          rightValue={String(pct(heatmapKpis.sg.shPct))}
                          midBg={colorScaleRedWhiteBlue(heatmapKpis.sg.pdo, 90, 100, 110)}
                          className="flex-1"
                        />
                      </>
                    ) : null}
                  </div>

                  <HeatHalfRink
                    title="Offensive End"
                    half="right"
                    zones={zones}
                    fillByZoneId={heatmap.fillByZoneId}
                    labelByZoneId={heatmap.labelByZoneId}
                    selectedZoneCode={selectedZoneCode}
                    onSelectZone={onSelectZone}
                  />
                </div>
              </>
            )}
          </div>
        </section>
      ) : tab === "tabeller" ? (
        <section className="space-y-4">
          <div className="rounded-md border border-[color:var(--surface-border)] p-4">
            <h2 className="text-lg font-semibold">Tabeller</h2>

            {selectedTeam.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">Vælg et Perspektiv.</p>
            ) : (
              <>
                <nav className="mt-4 flex flex-wrap gap-2">
                  {(
                    [
                      { key: "players-individual" as const, label: "Spillere - Individuel" },
                      { key: "players-onice" as const, label: "Spillere - På Banen" },
                      { key: "goalies" as const, label: "Målmænd" },
                      { key: "team" as const, label: "Hold" },
                    ]
                  ).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTablesTab(t.key)}
                      className={
                        tablesTab === t.key
                          ? "rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-[var(--brand-foreground)]"
                          : "rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm"
                      }
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>

                {tablesTab === "players-individual" ? (
                  <div className="mt-4 overflow-auto">
                    <table className="min-w-[900px] w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-[color:var(--surface)]">
                        <tr className="border-b border-[color:var(--surface-border)] text-left">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Spiller</th>
                          <th className="px-2 py-2">Kæde</th>
                          <th className="px-2 py-2">G</th>
                          <th className="px-2 py-2">A</th>
                          <th className="px-2 py-2">P</th>
                          <th className="px-2 py-2">SOG</th>
                          <th className="px-2 py-2">Miss</th>
                          <th className="px-2 py-2">Block</th>
                          <th className="px-2 py-2">Forsøg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerIndividualRows.map((r) => (
                          <tr key={r.name} className="border-b border-zinc-100">
                            <td className="px-2 py-1.5 tabular-nums">{r.number ?? ""}</td>
                            <td className="px-2 py-1.5">{r.name}</td>
                            <td className="px-2 py-1.5">{r.line ?? ""}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.g}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.a}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.p}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.sog}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.miss}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.block}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.attempts}</td>
                          </tr>
                        ))}
                        {playerIndividualRows.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-sm text-zinc-600" colSpan={10}>
                              Ingen data.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {tablesTab === "players-onice" ? (
                  <div className="mt-4 overflow-auto">
                    <table className="min-w-[1000px] w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-[color:var(--surface)]">
                        <tr className="border-b border-[color:var(--surface-border)] text-left">
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Spiller</th>
                          <th className="px-2 py-2">Kæde</th>
                          <th className="px-2 py-2">CF</th>
                          <th className="px-2 py-2">CA</th>
                          <th className="px-2 py-2">CF%</th>
                          <th className="px-2 py-2">GF</th>
                          <th className="px-2 py-2">GA</th>
                          <th className="px-2 py-2">GF%</th>
                          <th className="px-2 py-2">SF</th>
                          <th className="px-2 py-2">SA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {playerOnIceRows.map((r) => (
                          <tr key={r.name} className="border-b border-zinc-100">
                            <td className="px-2 py-1.5 tabular-nums">{r.number ?? ""}</td>
                            <td className="px-2 py-1.5">{r.name}</td>
                            <td className="px-2 py-1.5">{r.line ?? ""}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.cf}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.ca}</td>
                            <td className="px-2 py-1.5 tabular-nums">{pct(r.cfPct)}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.gf}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.ga}</td>
                            <td className="px-2 py-1.5 tabular-nums">{pct(r.gfPct)}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.sf}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.sa}</td>
                          </tr>
                        ))}
                        {playerOnIceRows.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-sm text-zinc-600" colSpan={11}>
                              Ingen data.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {tablesTab === "goalies" ? (
                  <div className="mt-4 overflow-auto">
                    <table className="min-w-[800px] w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-[color:var(--surface)]">
                        <tr className="border-b border-[color:var(--surface-border)] text-left">
                          <th className="px-2 py-2">Målmand</th>
                          <th className="px-2 py-2">Kampe</th>
                          <th className="px-2 py-2">SA</th>
                          <th className="px-2 py-2">GA</th>
                          <th className="px-2 py-2">Sv%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {goalieRows.map((r) => (
                          <tr key={r.name} className="border-b border-zinc-100">
                            <td className="px-2 py-1.5">{r.name}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.games}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.sa}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.ga}</td>
                            <td className="px-2 py-1.5 tabular-nums">{pct(r.svPct)}</td>
                          </tr>
                        ))}
                        {goalieRows.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-sm text-zinc-600" colSpan={5}>
                              Ingen data.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {tablesTab === "team" ? (
                  <div className="mt-4 overflow-auto">
                    <table className="min-w-[1100px] w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-[color:var(--surface)]">
                        <tr className="border-b border-[color:var(--surface-border)] text-left">
                          <th className="px-2 py-2">Kamp</th>
                          <th className="px-2 py-2">CF</th>
                          <th className="px-2 py-2">CA</th>
                          <th className="px-2 py-2">CF%</th>
                          <th className="px-2 py-2">SF</th>
                          <th className="px-2 py-2">SA</th>
                          <th className="px-2 py-2">SF%</th>
                          <th className="px-2 py-2">GF</th>
                          <th className="px-2 py-2">GA</th>
                          <th className="px-2 py-2">GF%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teamByGameRows.map((r) => (
                          <tr key={r.gameId} className="border-b border-zinc-100">
                            <td className="px-2 py-1.5">{r.label}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.cf}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.ca}</td>
                            <td className="px-2 py-1.5 tabular-nums">{pct(r.cfPct)}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.sf}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.sa}</td>
                            <td className="px-2 py-1.5 tabular-nums">{pct(r.sfPct)}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.gf}</td>
                            <td className="px-2 py-1.5 tabular-nums">{r.ga}</td>
                            <td className="px-2 py-1.5 tabular-nums">{pct(r.gfPct)}</td>
                          </tr>
                        ))}
                        {teamByGameRows.length === 0 ? (
                          <tr>
                            <td className="px-2 py-3 text-sm text-zinc-600" colSpan={10}>
                              Ingen data.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
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
