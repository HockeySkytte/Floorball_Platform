"use client";

import { useMemo, useRef, useState } from "react";
import type { VideoOverlay } from "@/components/video/types";
import { renderStickerSvg } from "@/components/video/stickers";

export type OverlayTool = "select" | "pen" | "arrow" | "circle" | "text" | "sticker";

export type ArrowKind = "line" | "curve";
export type ArrowStyle = "solid" | "dashed" | "wavy";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function makeId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const wx = p.x - a.x;
  const wy = p.y - a.y;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return dist(p, a);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return dist(p, b);
  const t = c1 / c2;
  return dist(p, { x: a.x + t * vx, y: a.y + t * vy });
}

function pointOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const tt = Math.max(0, Math.min(1, t));
  const a = 1 - tt;
  const x = a * a * x1 + 2 * a * tt * cx + tt * tt * x2;
  const y = a * a * y1 + 2 * a * tt * cy + tt * tt * y2;
  return { x, y };
}

function derivOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const tt = Math.max(0, Math.min(1, t));
  const dx = 2 * (1 - tt) * (cx - x1) + 2 * tt * (x2 - cx);
  const dy = 2 * (1 - tt) * (cy - y1) + 2 * tt * (y2 - cy);
  return { dx, dy };
}

function computeDefaultControlNorm(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.min(0.12, Math.max(0.02, len * 0.35));
  return { cx: clamp01(mx + nx * bend), cy: clamp01(my + ny * bend) };
}

function arrowStyleOf(o: Extract<VideoOverlay, { type: "arrow" }>) {
  const kind: ArrowKind = o.kind ?? "line";
  const style: ArrowStyle = o.style ?? "solid";
  const cx = typeof o.cx === "number" ? o.cx : (o.x1 + o.x2) / 2;
  const cy = typeof o.cy === "number" ? o.cy : (o.y1 + o.y2) / 2;
  return { kind, style, cx, cy };
}

function buildWavyQuadPath(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, amp: number, waveLen: number) {
  const steps = 70;
  const approxLen = Math.max(1e-6, Math.hypot(x2 - x1, y2 - y1));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointOnQuad(x1, y1, cx, cy, x2, y2, t);
    const d = derivOnQuad(x1, y1, cx, cy, x2, y2, t);
    const len = Math.max(1e-6, Math.hypot(d.dx, d.dy));
    const nx = -d.dy / len;
    const ny = d.dx / len;
    const phase = (t * approxLen * (2 * Math.PI)) / Math.max(1e-6, waveLen);
    // Fade wave to 0 near endpoints so the last segment aligns with the true tangent
    // (otherwise the SVG marker arrowhead can look mis-placed/rotated).
    const edgeFade = Math.min(1, Math.min(t / 0.08, (1 - t) / 0.08));
    const off = i === 0 || i === steps ? 0 : Math.sin(phase) * amp * edgeFade;
    pts.push({ x: clamp01(p.x + nx * off), y: clamp01(p.y + ny * off) });
  }
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function OverlayPreview({
  currentSec,
  overlays,
}: {
  currentSec: number;
  overlays: VideoOverlay[];
}) {
  const visible = overlays.filter((o) => isActive(o, currentSec));
  return (
    <svg
      className="absolute inset-0 z-20 h-full w-full"
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <marker
          id="arrowHead"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {visible.map((o) => {
        if (o.type === "text") {
          return (
            <text
              key={o.id}
              x={o.x}
              y={o.y}
              fill={o.color}
              fontSize={o.fontSize / 1000}
              fontWeight={700}
            >
              {o.text}
            </text>
          );
        }

        if (o.type === "arrow") {
          const { kind, style, cx, cy } = arrowStyleOf(o);
          const d = (() => {
            if (style === "wavy") {
              const w = Math.max(1, Number(o.width) || 3) / 1000;
              const amp = Math.min(0.02, Math.max(0.004, w * 2.2));
              const waveLen = Math.min(0.16, Math.max(0.03, 0.08 - w * 0.8));
              return buildWavyQuadPath(
                o.x1,
                o.y1,
                kind === "curve" ? cx : (o.x1 + o.x2) / 2,
                kind === "curve" ? cy : (o.y1 + o.y2) / 2,
                o.x2,
                o.y2,
                amp,
                waveLen
              );
            }
            if (kind === "curve") return `M ${o.x1} ${o.y1} Q ${cx} ${cy} ${o.x2} ${o.y2}`;
            return `M ${o.x1} ${o.y1} L ${o.x2} ${o.y2}`;
          })();

          return (
            <path
              key={o.id}
              d={d}
              stroke={o.color}
              strokeWidth={o.width / 1000}
              fill="none"
              strokeDasharray={style === "dashed" ? "0.02 0.015" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd="url(#arrowHead)"
            />
          );
        }

        if (o.type === "circle") {
          return (
            <circle
              key={o.id}
              cx={o.cx}
              cy={o.cy}
              r={o.r}
              fill="transparent"
              stroke={o.color}
              strokeWidth={o.width / 1000}
            />
          );
        }

        if (o.type === "pen") {
          const d = o.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
            .join(" ");
          return (
            <path
              key={o.id}
              d={d}
              fill="none"
              stroke={o.color}
              strokeWidth={o.width / 1000}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }

        if (o.type === "sticker") {
          return <g key={o.id}>{renderStickerSvg({ overlay: o })}</g>;
        }

        return null;
      })}
    </svg>
  );
}

function approxTextBox(o: Extract<VideoOverlay, { type: "text" }>) {
  const h = Math.max(0.008, (Number(o.fontSize) || 42) / 1000);
  const w = Math.max(0.02, h * 0.6 * Math.max(1, o.text?.length ?? 1));
  return { x1: o.x, y1: o.y - h, x2: o.x + w, y2: o.y };
}

function overlayBox(o: VideoOverlay) {
  switch (o.type) {
    case "text": {
      return approxTextBox(o);
    }
    case "sticker": {
      const s = Math.max(8, Number(o.size) || 64) / 1000;
      return { x1: o.x - s / 2, y1: o.y - s / 2, x2: o.x + s / 2, y2: o.y + s / 2 };
    }
    case "circle": {
      return { x1: o.cx - o.r, y1: o.cy - o.r, x2: o.cx + o.r, y2: o.cy + o.r };
    }
    case "arrow": {
      const { cx, cy } = arrowStyleOf(o);
      const x1 = Math.min(o.x1, o.x2, cx);
      const y1 = Math.min(o.y1, o.y2, cy);
      const x2 = Math.max(o.x1, o.x2, cx);
      const y2 = Math.max(o.y1, o.y2, cy);
      return { x1, y1, x2, y2 };
    }
    case "pen": {
      const xs = o.points.map((p) => p.x);
      const ys = o.points.map((p) => p.y);
      const x1 = Math.min(...xs);
      const x2 = Math.max(...xs);
      const y1 = Math.min(...ys);
      const y2 = Math.max(...ys);
      return { x1, y1, x2, y2 };
    }
  }
}

function pointInBox(p: { x: number; y: number }, b: { x1: number; y1: number; x2: number; y2: number }) {
  return p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;
}

function clampBox(b: { x1: number; y1: number; x2: number; y2: number }) {
  return {
    x1: clamp01(Math.min(b.x1, b.x2)),
    y1: clamp01(Math.min(b.y1, b.y2)),
    x2: clamp01(Math.max(b.x1, b.x2)),
    y2: clamp01(Math.max(b.y1, b.y2)),
  };
}

function isActive(o: VideoOverlay, t: number) {
  return t >= o.startSec && t <= o.endSec;
}

export default function OverlayEditor({
  currentSec,
  clipStart,
  clipEnd,
  overlays,
  setOverlays,
}: {
  currentSec: number;
  clipStart: number;
  clipEnd: number;
  overlays: VideoOverlay[];
  setOverlays: (next: VideoOverlay[]) => void;
}) {
  function deleteOverlay(id: string) {
    setOverlays(overlays.filter((o) => o.id !== id));
  }

  const [tool, setTool] = useState<OverlayTool>("select");
  const [color, setColor] = useState("#a855f7");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [size, setSize] = useState(96);
  const [arrowKind, setArrowKind] = useState<ArrowKind>("line");
  const [arrowStyle, setArrowStyle] = useState<ArrowStyle>("solid");

  return (
    <div className="space-y-2">
      <OverlayToolbar
        tool={tool}
        setTool={setTool}
        color={color}
        setColor={setColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        size={size}
        setSize={setSize}
        arrowKind={arrowKind}
        setArrowKind={setArrowKind}
        arrowStyle={arrowStyle}
        setArrowStyle={setArrowStyle}
      />

      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-200 bg-black/5">
        <OverlayCanvas
          currentSec={currentSec}
          clipStart={clipStart}
          clipEnd={clipEnd}
          overlays={overlays}
          setOverlays={setOverlays}
          tool={tool}
          color={color}
          strokeWidth={strokeWidth}
          size={size}
          arrowKind={arrowKind}
          arrowStyle={arrowStyle}
        />
      </div>

      {overlays.length > 0 ? (
        <OverlayList overlays={overlays} onDelete={deleteOverlay} />
      ) : null}
    </div>
  );
}

export function OverlayToolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  size,
  setSize,
  arrowKind = "line",
  setArrowKind,
  arrowStyle = "solid",
  setArrowStyle,
}: {
  tool: OverlayTool;
  setTool: (t: OverlayTool) => void;
  color: string;
  setColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (w: number) => void;
  size: number;
  setSize: (s: number) => void;
  arrowKind?: ArrowKind;
  setArrowKind?: (k: ArrowKind) => void;
  arrowStyle?: ArrowStyle;
  setArrowStyle?: (s: ArrowStyle) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-md border border-zinc-200 bg-white">
        {(
          [
            ["text", "Tekst"],
            ["sticker", "Symbol"],
            ["arrow", "Pil"],
            ["circle", "Cirkel"],
            ["pen", "Tegn"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTool(k)}
            className={
              "px-3 py-1.5 text-xs font-semibold " +
              (tool === k ? "bg-zinc-900 text-white" : "bg-white text-zinc-900")
            }
          >
            {label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs">
        Farve
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
      </label>

      {tool === "arrow" ? (
        <>
          <label className="flex items-center gap-2 text-xs">
            Pil
            <select
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
              value={arrowKind}
              onChange={(e) => setArrowKind?.((e.target.value as ArrowKind) || "line")}
            >
              <option value="line">Lige</option>
              <option value="curve">Kurve</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-xs">
            Stil
            <select
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
              value={arrowStyle}
              onChange={(e) => setArrowStyle?.((e.target.value as ArrowStyle) || "solid")}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Stiplet</option>
              <option value="wavy">Bølget</option>
            </select>
          </label>
        </>
      ) : null}

      <label className="flex items-center gap-2 text-xs">
        Tykkelse
        <input
          type="number"
          min={1}
          max={20}
          value={strokeWidth}
          onChange={(e) => setStrokeWidth(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
          className="w-16 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
        />
      </label>

      <label className="flex items-center gap-2 text-xs">
        Størrelse
        <input
          type="number"
          min={8}
          max={260}
          value={size}
          onChange={(e) => setSize(Math.max(8, Math.min(260, Number(e.target.value) || 80)))}
          className="w-16 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs"
        />
      </label>
    </div>
  );
}

export function OverlayList({
  overlays,
  onDelete,
  selectedId,
  onSelect,
}: {
  overlays: VideoOverlay[];
  onDelete: (id: string) => void;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="mb-2 text-xs font-semibold">Overlays</div>
      <div className="space-y-2">
        {overlays
          .slice()
          .reverse()
          .map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                className={
                  "min-w-0 flex-1 truncate rounded px-2 py-1 text-left " +
                  (selectedId === o.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-50")
                }
                onClick={() => onSelect?.(o.id)}
              >
                {o.type.toUpperCase()} @ {Math.round(o.startSec)}s → {Math.round(o.endSec)}s
                {o.type === "text" ? ` • ${o.text}` : ""}
              </button>
              <button
                type="button"
                onClick={() => onDelete(o.id)}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1"
              >
                Slet
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}

export function OverlayCanvas({
  currentSec,
  clipStart,
  clipEnd,
  overlays,
  setOverlays,
  tool,
  color,
  strokeWidth,
  size,
  arrowKind = "line",
  arrowStyle = "solid",
  stickerId,
  selectedId,
  onSelect,
  onBeginEdit,
  onEndEdit,
}: {
  currentSec: number;
  clipStart: number;
  clipEnd: number;
  overlays: VideoOverlay[];
  setOverlays: (next: VideoOverlay[]) => void;
  tool: OverlayTool;
  color: string;
  strokeWidth: number;
  size: number;
  arrowKind?: ArrowKind;
  arrowStyle?: ArrowStyle;
  stickerId?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onBeginEdit?: () => void;
  onEndEdit?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<
    | null
    | {
        kind: "pen";
        id: string;
      }
    | {
        kind: "arrow" | "circle";
        id: string;
        startX: number;
        startY: number;
      }
    | {
        kind: "move";
        id: string;
        startX: number;
        startY: number;
      }
    | {
        kind: "resize";
        id: string;
        startX: number;
        startY: number;
        box: { x1: number; y1: number; x2: number; y2: number };
      }
    | {
        kind: "arrow-end";
        id: string;
        end: "start" | "end";
      }
    | {
        kind: "arrow-cp";
        id: string;
      }
  >(null);

  const visible = useMemo(() => overlays.filter((o) => isActive(o, currentSec)), [overlays, currentSec]);

  function toNorm(e: React.PointerEvent) {
    const host = hostRef.current;
    if (!host) return { x: 0, y: 0 };
    const r = host.getBoundingClientRect();
    const x = clamp01((e.clientX - r.left) / Math.max(1, r.width));
    const y = clamp01((e.clientY - r.top) / Math.max(1, r.height));
    return { x, y };
  }

  function hitTest(point: { x: number; y: number }) {
    const list = overlays
      .filter((o) => isActive(o, currentSec))
      .slice()
      .reverse();

    // threshold in normalized units (roughly 12px at 1080 baseline)
    const th = 12 / 1000;

    for (const o of list) {
      if (o.type === "circle") {
        if (dist(point, { x: o.cx, y: o.cy }) <= o.r + th) return o.id;
        continue;
      }

      if (o.type === "arrow") {
        const { kind, cx, cy } = arrowStyleOf(o);
        if (kind === "curve") {
          const pts: Array<{ x: number; y: number }> = [];
          const n = 18;
          for (let i = 0; i <= n; i++) pts.push(pointOnQuad(o.x1, o.y1, cx, cy, o.x2, o.y2, i / n));
          let best = Infinity;
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i]!;
            const b = pts[i + 1]!;
            best = Math.min(best, distToSegment(point, a, b));
          }
          if (best <= Math.max(th, (o.width || 3) / 1000)) return o.id;
        } else {
          const d = distToSegment(point, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
          if (d <= Math.max(th, (o.width || 3) / 1000)) return o.id;
        }
        continue;
      }

      if (o.type === "pen") {
        for (let i = 1; i < o.points.length; i++) {
          const a = o.points[i - 1]!;
          const b = o.points[i]!;
          const d = distToSegment(point, a, b);
          if (d <= Math.max(th, (o.width || 3) / 1000)) return o.id;
        }
        continue;
      }

      const b = clampBox(overlayBox(o));
      if (pointInBox(point, b)) return o.id;
    }

    return null;
  }

  function selectedOverlay() {
    if (!selectedId) return null;
    return overlays.find((o) => o.id === selectedId) ?? null;
  }

  function handleHit(point: { x: number; y: number }, o: VideoOverlay) {
    const th = 14 / 1000;
    if (o.type === "arrow") {
      if (dist(point, { x: o.x1, y: o.y1 }) <= th) return { kind: "arrow-end" as const, end: "start" as const };
      if (dist(point, { x: o.x2, y: o.y2 }) <= th) return { kind: "arrow-end" as const, end: "end" as const };

      const { kind, cx, cy } = arrowStyleOf(o);
      if (kind === "curve") {
        if (dist(point, { x: cx, y: cy }) <= th) return { kind: "arrow-cp" as const };
      }
      return null;
    }

    const b = clampBox(overlayBox(o));
    const se = { x: b.x2, y: b.y2 };
    if (dist(point, se) <= th) return { kind: "resize" as const, box: b };
    if (pointInBox(point, b)) return { kind: "move" as const };
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    const isRight = e.button === 2;
    if (isRight) e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const { x, y } = toNorm(e);
    const pt = { x, y };

    // Even when another tool is active, allow left-click dragging of handles
    // for the currently selected overlay. This makes curve control points usable
    // without requiring right-click (and helps on trackpads).
    if (!isRight && tool !== "select" && selectedId) {
      const sel = selectedOverlay();
      if (sel && isActive(sel, currentSec)) {
        const h = handleHit(pt, sel);
        if (h) {
          onBeginEdit?.();
          if (h.kind === "arrow-end" && sel.type === "arrow") {
            dragRef.current = { kind: "arrow-end", id: sel.id, end: h.end };
            return;
          }
          if (h.kind === "arrow-cp" && sel.type === "arrow") {
            dragRef.current = { kind: "arrow-cp", id: sel.id };
            return;
          }
          if (h.kind === "resize") {
            dragRef.current = { kind: "resize", id: sel.id, startX: x, startY: y, box: h.box };
            return;
          }
          dragRef.current = { kind: "move", id: sel.id, startX: x, startY: y };
          return;
        }
      }
    }

    if (isRight || tool === "select") {
      const hitId = hitTest(pt);
      onSelect?.(hitId);
      if (!hitId) return;

      const o = overlays.find((oo) => oo.id === hitId);
      if (!o) return;
      const h = handleHit(pt, o);
      if (!h) return;

      onBeginEdit?.();

      if (h.kind === "arrow-end" && o.type === "arrow") {
        dragRef.current = { kind: "arrow-end", id: o.id, end: h.end };
        return;
      }

      if (h.kind === "arrow-cp" && o.type === "arrow") {
        dragRef.current = { kind: "arrow-cp", id: o.id };
        return;
      }

      if (h.kind === "resize") {
        dragRef.current = { kind: "resize", id: o.id, startX: x, startY: y, box: h.box };
        return;
      }

      dragRef.current = { kind: "move", id: o.id, startX: x, startY: y };
      return;
    }

    const id = makeId();

    if (tool === "text") {
      onBeginEdit?.();
      const text = window.prompt("Tekst:") ?? "";
      const t = text.trim();
      if (!t) return;
      setOverlays([
        ...overlays,
        {
          id,
          type: "text",
          x,
          y,
          text: t,
          fontSize: Math.max(12, Number(size) || 42),
          color,
          startSec: Math.max(clipStart, currentSec),
          endSec: clipEnd,
        },
      ]);
      onEndEdit?.();
      return;
    }

    if (tool === "sticker") {
      onBeginEdit?.();
      setOverlays([
        ...overlays,
        {
          id,
          type: "sticker",
          x,
          y,
          stickerId: String(stickerId ?? "target"),
          size: Math.max(12, Number(size) || 96),
          rotation: 0,
          color,
          startSec: Math.max(clipStart, currentSec),
          endSec: clipEnd,
        },
      ]);
      onEndEdit?.();
      return;
    }

    if (tool === "pen") {
      onBeginEdit?.();
      setOverlays([
        ...overlays,
        {
          id,
          type: "pen",
          points: [{ x, y }],
          width: strokeWidth,
          color,
          startSec: Math.max(clipStart, currentSec),
          endSec: clipEnd,
        },
      ]);
      dragRef.current = { kind: "pen", id };
      return;
    }

    if (tool === "arrow") {
      onBeginEdit?.();
      const kind: ArrowKind = arrowKind ?? "line";
      const style: ArrowStyle = arrowStyle ?? "solid";
      setOverlays([
        ...overlays,
        {
          id,
          type: "arrow",
          kind,
          style,
          x1: x,
          y1: y,
          ...(kind === "curve" ? { cx: x, cy: y, manualControl: false } : null),
          x2: x,
          y2: y,
          width: strokeWidth,
          color,
          startSec: Math.max(clipStart, currentSec),
          endSec: clipEnd,
        },
      ]);
      dragRef.current = { kind: "arrow", id, startX: x, startY: y };
      return;
    }

    if (tool === "circle") {
      onBeginEdit?.();
      setOverlays([
        ...overlays,
        {
          id,
          type: "circle",
          cx: x,
          cy: y,
          r: Math.max(0.01, Math.min(0.25, (Math.max(12, Number(size) || 90) / 1000) * 0.9)),
          width: strokeWidth,
          color,
          startSec: Math.max(clipStart, currentSec),
          endSec: clipEnd,
        },
      ]);
      dragRef.current = { kind: "circle", id, startX: x, startY: y };
      return;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toNorm(e);

    if (drag.kind === "move") {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      dragRef.current = { ...drag, startX: x, startY: y };
      setOverlays(
        overlays.map((o) => {
          if (o.id !== drag.id) return o;
          switch (o.type) {
            case "text":
              return { ...o, x: clamp01(o.x + dx), y: clamp01(o.y + dy) };
            case "sticker":
              return { ...o, x: clamp01(o.x + dx), y: clamp01(o.y + dy) };
            case "circle":
              return { ...o, cx: clamp01(o.cx + dx), cy: clamp01(o.cy + dy) };
            case "arrow":
              return {
                ...o,
                x1: clamp01(o.x1 + dx),
                y1: clamp01(o.y1 + dy),
                ...(typeof o.cx === "number" && typeof o.cy === "number" ? { cx: clamp01(o.cx + dx), cy: clamp01(o.cy + dy) } : null),
                x2: clamp01(o.x2 + dx),
                y2: clamp01(o.y2 + dy),
              };
            case "pen":
              return { ...o, points: o.points.map((p) => ({ x: clamp01(p.x + dx), y: clamp01(p.y + dy) })) };
          }
        })
      );
      return;
    }

    if (drag.kind === "arrow-end") {
      setOverlays(
        overlays.map((o) => {
          if (o.id !== drag.id || o.type !== "arrow") return o;
          const { kind, cx, cy } = arrowStyleOf(o);
          const next = drag.end === "start" ? { ...o, x1: x, y1: y } : { ...o, x2: x, y2: y };
          if (kind !== "curve") return next;
          if (o.manualControl) return next;
          const d = computeDefaultControlNorm(next.x1, next.y1, next.x2, next.y2);
          return { ...next, cx: d.cx, cy: d.cy };
        })
      );
      return;
    }

    if (drag.kind === "arrow-cp") {
      setOverlays(
        overlays.map((o) => {
          if (o.id !== drag.id || o.type !== "arrow") return o;
          return { ...o, cx: x, cy: y, kind: o.kind ?? "curve", manualControl: true };
        })
      );
      return;
    }

    if (drag.kind === "resize") {
      const o = overlays.find((oo) => oo.id === drag.id);
      if (!o) return;
      const b = drag.box;

      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const d = Math.max(dx, dy);

      setOverlays(
        overlays.map((oo) => {
          if (oo.id !== drag.id) return oo;
          switch (oo.type) {
            case "text": {
              const next = Math.max(10, (Number(oo.fontSize) || 42) + d * 1000);
              return { ...oo, fontSize: next };
            }
            case "sticker": {
              const next = Math.max(10, (Number(oo.size) || 64) + d * 1000);
              return { ...oo, size: next };
            }
            case "circle": {
              const next = Math.max(0.005, (Number(oo.r) || 0.05) + d);
              return { ...oo, r: next };
            }
            case "pen": {
              const next = Math.max(1, (Number(oo.width) || 3) + d * 1000);
              return { ...oo, width: next };
            }
            case "arrow": {
              // arrows resize via endpoints; but allow width change as a fallback
              const next = Math.max(1, (Number(oo.width) || 3) + d * 1000);
              return { ...oo, width: next };
            }
          }
        })
      );

      // keep drag anchored in place for smooth resize
      dragRef.current = { ...drag, startX: x, startY: y, box: { ...b, x2: clamp01(b.x2 + dx), y2: clamp01(b.y2 + dy) } };
      return;
    }

    if (drag.kind === "pen") {
      setOverlays(
        overlays.map((o) => {
          if (o.id !== drag.id || o.type !== "pen") return o;
          return { ...o, points: [...o.points, { x, y }] };
        })
      );
      return;
    }

    if (drag.kind === "arrow") {
      setOverlays(
        overlays.map((o) => {
          if (o.id !== drag.id || o.type !== "arrow") return o;
          const kind: ArrowKind = o.kind ?? "line";
          if (kind === "curve") {
            const d = computeDefaultControlNorm(o.x1, o.y1, x, y);
            return { ...o, x2: x, y2: y, cx: d.cx, cy: d.cy };
          }
          return { ...o, x2: x, y2: y };
        })
      );
      return;
    }

    if (drag.kind === "circle") {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const r = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
      setOverlays(
        overlays.map((o) => {
          if (o.id !== drag.id || o.type !== "circle") return o;
          return { ...o, r };
        })
      );
      return;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragRef.current) {
      dragRef.current = null;
      onEndEdit?.();
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }

  return (
    <div ref={hostRef} className="relative h-full w-full">
      <div
        className="absolute inset-0 z-10"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: "none", pointerEvents: "auto" }}
      />

      <svg
        className="absolute inset-0 z-20 h-full w-full"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <marker
            id="arrowHead"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>

        {visible.map((o) => {
          if (o.type === "text") {
            return (
              <text
                key={o.id}
                x={o.x}
                y={o.y}
                fill={o.color}
                fontSize={o.fontSize / 1000}
                fontWeight={700}
              >
                {o.text}
              </text>
            );
          }

          if (o.type === "arrow") {
            const { kind, style, cx, cy } = arrowStyleOf(o);
            const d = (() => {
              if (style === "wavy") {
                const w = Math.max(1, Number(o.width) || 3) / 1000;
                const amp = Math.min(0.02, Math.max(0.004, w * 2.2));
                const waveLen = Math.min(0.16, Math.max(0.03, 0.08 - w * 0.8));
                return buildWavyQuadPath(o.x1, o.y1, kind === "curve" ? cx : (o.x1 + o.x2) / 2, kind === "curve" ? cy : (o.y1 + o.y2) / 2, o.x2, o.y2, amp, waveLen);
              }
              if (kind === "curve") return `M ${o.x1} ${o.y1} Q ${cx} ${cy} ${o.x2} ${o.y2}`;
              return `M ${o.x1} ${o.y1} L ${o.x2} ${o.y2}`;
            })();

            return (
              <path
                key={o.id}
                d={d}
                stroke={o.color}
                strokeWidth={o.width / 1000}
                fill="none"
                strokeDasharray={style === "dashed" ? "0.02 0.015" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#arrowHead)"
              />
            );
          }

          if (o.type === "circle") {
            return (
              <circle
                key={o.id}
                cx={o.cx}
                cy={o.cy}
                r={o.r}
                fill="transparent"
                stroke={o.color}
                strokeWidth={o.width / 1000}
              />
            );
          }

          if (o.type === "pen") {
            const d = o.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ");
            return (
              <path
                key={o.id}
                d={d}
                fill="none"
                stroke={o.color}
                strokeWidth={o.width / 1000}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }

          if (o.type === "sticker") {
            return <g key={o.id}>{renderStickerSvg({ overlay: o })}</g>;
          }

          return null;
        })}

        {(() => {
          const sel = selectedOverlay();
          if (!sel) return null;
          if (!isActive(sel, currentSec)) return null;

          if (sel.type === "arrow") {
            const { kind, cx, cy } = arrowStyleOf(sel);
            const shadowD =
              kind === "curve"
                ? `M ${sel.x1} ${sel.y1} Q ${cx} ${cy} ${sel.x2} ${sel.y2}`
                : `M ${sel.x1} ${sel.y1} L ${sel.x2} ${sel.y2}`;
            return (
              <g>
                <path
                  d={shadowD}
                  stroke="#111827"
                  strokeWidth={Math.max(1, sel.width) / 1000 + 0.002}
                  opacity={0.25}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={sel.x1} cy={sel.y1} r={0.012} fill="#fff" stroke="#111827" strokeWidth={0.002} />
                {kind === "curve" ? (
                  <circle cx={cx} cy={cy} r={0.012} fill="#fff" stroke="#111827" strokeWidth={0.002} />
                ) : null}
                <circle cx={sel.x2} cy={sel.y2} r={0.012} fill="#fff" stroke="#111827" strokeWidth={0.002} />
              </g>
            );
          }

          const b = clampBox(overlayBox(sel));
          const w = Math.max(0.001, b.x2 - b.x1);
          const h = Math.max(0.001, b.y2 - b.y1);
          return (
            <g>
              <rect
                x={b.x1}
                y={b.y1}
                width={w}
                height={h}
                fill="transparent"
                stroke="#111827"
                strokeWidth={0.002}
                strokeDasharray="0.006 0.004"
                opacity={0.9}
              />
              <circle cx={b.x2} cy={b.y2} r={0.012} fill="#fff" stroke="#111827" strokeWidth={0.002} />
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
