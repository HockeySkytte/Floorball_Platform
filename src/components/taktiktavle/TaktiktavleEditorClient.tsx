"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTaktiktavleUi } from "@/components/taktiktavle/TaktiktavleProvider";

type DocKind = "image" | "animation";

type CanvasTemplate = {
  crop: "full" | "half";
  rotationDeg: 0 | 90 | 180 | 270;
};

type ShapeBase = {
  id: string;
  color: string;
  width: number;
};

type PathStyle = "solid" | "dashed" | "wavy";

type PathShape = ShapeBase & {
  type: "path";
  style: PathStyle;
  arrow: boolean;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  attachId?: string | null;
};

type PlayerShape = ShapeBase & {
  type: "player";
  x: number;
  y: number;
  r: number;
};

type ConeShape = ShapeBase & {
  type: "cone";
  x: number;
  y: number;
  size: number;
};

type BallShape = ShapeBase & {
  type: "ball";
  x: number;
  y: number;
  r: number;
};

type TextShape = ShapeBase & {
  type: "text";
  x: number;
  y: number;
  text: string;
};

type Shape = PathShape | PlayerShape | ConeShape | BallShape | TextShape;

type Frame = {
  id: string;
  durationMs: number;
  shapes: Shape[];
};

type DocumentState = {
  id: string;
  kind: DocKind;
  name: string;
  template: CanvasTemplate;
  frames: Frame[];
};

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(2, 7);
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

function pointOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const tt = clamp01(t);
  const a = 1 - tt;
  const x = a * a * x1 + 2 * a * tt * cx + tt * tt * x2;
  const y = a * a * y1 + 2 * a * tt * cy + tt * tt * y2;
  return { x, y };
}

function derivOnQuad(x1: number, y1: number, cx: number, cy: number, x2: number, y2: number, t: number) {
  const tt = clamp01(t);
  const dx = 2 * (1 - tt) * (cx - x1) + 2 * tt * (x2 - cx);
  const dy = 2 * (1 - tt) * (cy - y1) + 2 * tt * (y2 - cy);
  return { dx, dy };
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const tt = Math.max(0, Math.min(1, t));
  const cx = x1 + tt * dx;
  const cy = y1 + tt * dy;
  return Math.hypot(px - cx, py - cy);
}

function hitTest(shape: Shape, x: number, y: number) {
  if (shape.type === "player") return Math.hypot(x - shape.x, y - shape.y) <= shape.r + 8;
  if (shape.type === "cone") return Math.hypot(x - shape.x, y - shape.y) <= shape.size + 10;
  if (shape.type === "ball") return Math.hypot(x - shape.x, y - shape.y) <= shape.r + 8;
  if (shape.type === "text") return Math.hypot(x - shape.x, y - shape.y) <= 24;

  // Path: sample points and compute min distance to polyline segments
  const pts: Array<{ x: number; y: number }> = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    pts.push(pointOnQuad(shape.x1, shape.y1, shape.cx, shape.cy, shape.x2, shape.y2, i / n));
  }
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    best = Math.min(best, distToSegment(x, y, a.x, a.y, b.x, b.y));
  }
  return best <= 12;
}

function computeDefaultControl(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.min(80, len * 0.25);
  return { cx: mx + nx * bend, cy: my + ny * bend };
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number) {
  const angle = Math.atan2(dy, dx);
  const headLen = 14;
  const a1 = angle + Math.PI * 0.85;
  const a2 = angle - Math.PI * 0.85;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + headLen * Math.cos(a1), y + headLen * Math.sin(a1));
  ctx.moveTo(x, y);
  ctx.lineTo(x + headLen * Math.cos(a2), y + headLen * Math.sin(a2));
  ctx.stroke();
}

function drawWavyQuad(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  amp: number,
  waveLen: number
) {
  const steps = 80;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = pointOnQuad(x1, y1, cx, cy, x2, y2, t);
    const d = derivOnQuad(x1, y1, cx, cy, x2, y2, t);
    const len = Math.max(1e-6, Math.hypot(d.dx, d.dy));
    const nx = -d.dy / len;
    const ny = d.dx / len;
    const phase = (t * Math.hypot(x2 - x1, y2 - y1) * (2 * Math.PI)) / Math.max(1, waveLen);
    const off = Math.sin(phase) * amp;
    const xx = p.x + nx * off;
    const yy = p.y + ny * off;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
  ctx.stroke();
}

function templateLabel(t: CanvasTemplate) {
  const base = t.crop === "full" ? "Fuld bane" : "Halv bane";
  return `${base} • Rotation ${t.rotationDeg}°`;
}

export default function TaktiktavleEditorClient() {
  const { tool, color, strokeWidth } = useTaktiktavleUi();

  const [doc, setDoc] = useState<DocumentState | null>(null);
  const [past, setPast] = useState<DocumentState[]>([]);
  const [future, setFuture] = useState<DocumentState[]>([]);

  const [selectOpen, setSelectOpen] = useState(false);
  const [pendingKind, setPendingKind] = useState<DocKind>("image");
  const [pendingCrop, setPendingCrop] = useState<CanvasTemplate["crop"]>("full");
  const [pendingRotation, setPendingRotation] = useState<CanvasTemplate["rotationDeg"]>(0);

  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);

  const [containerSize, setContainerSize] = useState({ w: 900, h: 560 });

  const playRef = useRef<{ frameStart: number } | null>(null);
  const draftRef = useRef<Shape | null>(null);
  const dragRef = useRef<
    | null
    | {
        shapeId: string;
        startX: number;
        startY: number;
        baseDoc: DocumentState;
      }
  >(null);

  const activeFrame = useMemo(() => {
    if (!doc) return null;
    return doc.frames[Math.min(activeFrameIndex, doc.frames.length - 1)] ?? null;
  }, [doc, activeFrameIndex]);

  const selectedShape = useMemo(() => {
    if (!activeFrame || !selectedId) return null;
    return activeFrame.shapes.find((s) => s.id === selectedId) ?? null;
  }, [activeFrame, selectedId]);

  useEffect(() => {
    const img = new Image();
    img.src = "/bane.png";
    img.onload = () => {
      bgImgRef.current = img;
      redraw(performance.now());
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: Math.max(320, r.width), h: Math.max(240, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function pushHistory(snapshot: DocumentState) {
    setPast((p) => [...p, snapshot]);
    setFuture([]);
  }

  function applyMutation(mutator: (d: DocumentState) => DocumentState) {
    if (!doc) return;
    pushHistory(doc);
    setDoc(mutator(doc));
  }

  function undo() {
    if (past.length === 0 || !doc) return;
    const prev = past[past.length - 1]!;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [doc, ...f]);
    setDoc(prev);
    setIsPlaying(false);
    setSelectedId(null);
  }

  function redo() {
    if (future.length === 0 || !doc) return;
    const next = future[0]!;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, doc]);
    setDoc(next);
    setIsPlaying(false);
    setSelectedId(null);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "y") || (e.key.toLowerCase() === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, past.length, future.length]);

  function createNew(kind: DocKind) {
    setPendingKind(kind);
    setPendingCrop("full");
    setPendingRotation(0);
    setSelectOpen(true);
  }

  function confirmTemplate() {
    const firstFrame: Frame = { id: uid(), durationMs: 1500, shapes: [] };
    const next: DocumentState = {
      id: uid(),
      kind: pendingKind,
      name: pendingKind === "image" ? "Nyt billede" : "Ny animation",
      template: { crop: pendingCrop, rotationDeg: pendingRotation },
      frames: [firstFrame],
    };
    setDoc(next);
    setPast([]);
    setFuture([]);
    setActiveFrameIndex(0);
    setIsPlaying(false);
    setSelectedId(null);
    setSelectOpen(false);
    requestAnimationFrame(() => redraw(performance.now()));
  }

  function currentLineConfig(): { style: PathStyle; arrow: boolean } | null {
    if (tool.startsWith("line-")) {
      const s = tool.replace("line-", "") as PathStyle;
      return { style: s, arrow: false };
    }
    if (tool.startsWith("arrow-")) {
      const s = tool.replace("arrow-", "") as PathStyle;
      return { style: s, arrow: true };
    }
    return null;
  }

  function canvasPoint(ev: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function commitShape(s: Shape) {
    if (!doc) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      frames[idx] = { ...f, shapes: [...f.shapes, s] };
      return { ...d, frames };
    });
    requestAnimationFrame(() => redraw(performance.now()));
  }

  function deleteAt(x: number, y: number) {
    if (!doc || !activeFrame) return;
    const idx = (() => {
      for (let i = activeFrame.shapes.length - 1; i >= 0; i--) {
        if (hitTest(activeFrame.shapes[i]!, x, y)) return i;
      }
      return -1;
    })();

    if (idx < 0) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      const fi = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[fi]!;
      const shapes = [...f.shapes];
      const removed = shapes.splice(idx, 1)[0];
      // Clear attachments pointing to removed shape
      const cleaned = shapes.map((s) => {
        if (s.type !== "path") return s;
        if (removed && s.attachId === removed.id) return { ...s, attachId: null };
        return s;
      });
      frames[fi] = { ...f, shapes: cleaned };
      return { ...d, frames };
    });
    setSelectedId(null);
  }

  function moveShape(base: Shape, dx: number, dy: number): Shape {
    if (base.type === "player") return { ...base, x: base.x + dx, y: base.y + dy };
    if (base.type === "cone") return { ...base, x: base.x + dx, y: base.y + dy };
    if (base.type === "ball") return { ...base, x: base.x + dx, y: base.y + dy };
    if (base.type === "text") return { ...base, x: base.x + dx, y: base.y + dy };
    return {
      ...base,
      x1: base.x1 + dx,
      y1: base.y1 + dy,
      cx: base.cx + dx,
      cy: base.cy + dy,
      x2: base.x2 + dx,
      y2: base.y2 + dy,
    };
  }

  function onPointerDown(ev: React.PointerEvent) {
    if (!doc || !activeFrame) return;
    const p = canvasPoint(ev);

    // Eraser
    if (tool === "eraser") {
      deleteAt(p.x, p.y);
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Select/move
    if (tool === "select") {
      let hit: Shape | null = null;
      for (let i = activeFrame.shapes.length - 1; i >= 0; i--) {
        const s = activeFrame.shapes[i]!;
        if (hitTest(s, p.x, p.y)) {
          hit = s;
          break;
        }
      }
      setSelectedId(hit?.id ?? null);
      if (hit) {
        dragRef.current = { shapeId: hit.id, startX: p.x, startY: p.y, baseDoc: doc };
        (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
      }
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Accessories
    if (tool === "player") {
      commitShape({ id: uid(), type: "player", x: p.x, y: p.y, r: 9, color, width: strokeWidth });
      return;
    }
    if (tool === "cone") {
      commitShape({ id: uid(), type: "cone", x: p.x, y: p.y, size: 10, color, width: strokeWidth });
      return;
    }
    if (tool === "ball") {
      commitShape({ id: uid(), type: "ball", x: p.x, y: p.y, r: 7, color, width: strokeWidth });
      return;
    }
    if (tool === "text") {
      const text = window.prompt("Tekst:") ?? "";
      if (text.trim()) {
        commitShape({ id: uid(), type: "text", x: p.x, y: p.y, text: text.trim(), color, width: strokeWidth });
      }
      return;
    }

    // Path tools
    const cfg = currentLineConfig();
    if (cfg) {
      const ctrl = computeDefaultControl(p.x, p.y, p.x, p.y);
      const attachId = doc.kind === "animation" && selectedShape && selectedShape.type !== "path" ? selectedShape.id : null;
      draftRef.current = {
        id: uid(),
        type: "path",
        style: cfg.style,
        arrow: cfg.arrow,
        x1: p.x,
        y1: p.y,
        cx: ctrl.cx,
        cy: ctrl.cy,
        x2: p.x,
        y2: p.y,
        attachId,
        color,
        width: strokeWidth,
      };
      (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
      requestAnimationFrame(() => redraw(performance.now()));
    }
  }

  function onPointerMove(ev: React.PointerEvent) {
    const p = canvasPoint(ev);

    // Drag move
    if (dragRef.current && doc && activeFrame) {
      const { shapeId, startX, startY, baseDoc } = dragRef.current;
      const dx = p.x - startX;
      const dy = p.y - startY;

      const fi = Math.min(activeFrameIndex, baseDoc.frames.length - 1);
      const baseFrame = baseDoc.frames[fi]!;
      const nextShapes = baseFrame.shapes.map((s) => (s.id === shapeId ? moveShape(s, dx, dy) : s));
      const nextFrames = [...baseDoc.frames];
      nextFrames[fi] = { ...baseFrame, shapes: nextShapes };
      setDoc({ ...baseDoc, frames: nextFrames });
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Draft path
    const d = draftRef.current;
    if (!d || d.type !== "path") return;
    d.x2 = p.x;
    d.y2 = p.y;
    const ctrl = computeDefaultControl(d.x1, d.y1, d.x2, d.y2);
    d.cx = ctrl.cx;
    d.cy = ctrl.cy;
    requestAnimationFrame(() => redraw(performance.now()));
  }

  function onPointerUp(ev: React.PointerEvent) {
    // End drag
    if (dragRef.current && doc) {
      const base = dragRef.current.baseDoc;
      dragRef.current = null;
      // push base snapshot once
      setPast((p) => [...p, base]);
      setFuture([]);
      try {
        (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      requestAnimationFrame(() => redraw(performance.now()));
      return;
    }

    // Commit draft
    const d = draftRef.current;
    if (d && d.type === "path") {
      draftRef.current = null;
      const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
      if (len > 4) commitShape(d);
      try {
        (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      requestAnimationFrame(() => redraw(performance.now()));
    }
  }

  function exportJson() {
    if (!doc) return;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.name.replace(/[^a-z0-9_-]+/gi, "_") || "taktiktavle"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    if (!doc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    const suffix = doc.kind === "animation" ? `frame_${activeFrameIndex + 1}` : "billede";
    a.download = `${doc.name.replace(/[^a-z0-9_-]+/gi, "_") || "taktiktavle"}_${suffix}.png`;
    a.click();
  }

  function clearFrame() {
    if (!doc) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      const idx = Math.min(activeFrameIndex, frames.length - 1);
      const f = frames[idx]!;
      frames[idx] = { ...f, shapes: [] };
      return { ...d, frames };
    });
    setSelectedId(null);
  }

  function addFrame() {
    if (!doc) return;
    applyMutation((d) => ({ ...d, frames: [...d.frames, { id: uid(), durationMs: 1500, shapes: [] }] }));
    setActiveFrameIndex((i) => i + 1);
    setSelectedId(null);
  }

  function duplicateFrame() {
    if (!doc || !activeFrame) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      frames.splice(activeFrameIndex + 1, 0, {
        id: uid(),
        durationMs: activeFrame.durationMs,
        shapes: activeFrame.shapes.map((s) => ({ ...s, id: uid() })),
      });
      return { ...d, frames };
    });
    setActiveFrameIndex((i) => i + 1);
    setSelectedId(null);
  }

  function deleteFrame() {
    if (!doc || doc.frames.length <= 1) return;
    applyMutation((d) => {
      const frames = [...d.frames];
      frames.splice(activeFrameIndex, 1);
      return { ...d, frames };
    });
    setActiveFrameIndex((i) => Math.max(0, i - 1));
    setSelectedId(null);
  }

  function redraw(now: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const wCss = Math.floor(containerSize.w);
    const hCss = Math.floor(Math.min(containerSize.h, Math.max(320, wCss * 0.62)));

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(wCss * dpr);
    canvas.height = Math.floor(hCss * dpr);
    canvas.style.width = `${wCss}px`;
    canvas.style.height = `${hCss}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);

    // Background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, wCss, hCss);

    if (doc) {
      const img = bgImgRef.current;
      if (img) {
        drawTemplateBackground(ctx, img, wCss, hCss, doc.template);
      }
    }

    // Overlay if no doc
    if (!doc) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, wCss, hCss);
      ctx.fillStyle = "white";
      ctx.font = "700 20px ui-sans-serif, system-ui";
      ctx.fillText("Opret et billede eller en animation", 24, 48);
      ctx.font = "400 14px ui-sans-serif, system-ui";
      ctx.fillText("Brug knapperne ovenfor for at komme i gang.", 24, 76);
      return;
    }

    const frame = doc.frames[Math.min(activeFrameIndex, doc.frames.length - 1)]!;

    // Playback progress for attached objects
    const progress = (() => {
      if (!isPlaying || doc.kind !== "animation") return null;
      const start = playRef.current?.frameStart ?? now;
      const dur = Math.max(200, frame.durationMs);
      const t = (now - start) / dur;
      return clamp01(t);
    })();

    const attachedPos = new Map<string, { x: number; y: number }>();
    if (progress !== null) {
      for (const s of frame.shapes) {
        if (s.type !== "path") continue;
        const aid = s.attachId ?? null;
        if (!aid) continue;
        const p = pointOnQuad(s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, progress);
        attachedPos.set(aid, p);
      }
    }

    // Draw paths first
    for (const s of frame.shapes) {
      if (s.type !== "path") continue;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (s.style === "dashed") ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);

      if (s.style === "wavy") {
        drawWavyQuad(ctx, s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, 4, 22);
      } else {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2);
        ctx.stroke();
      }

      if (s.arrow) {
        const d = derivOnQuad(s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, 0.995);
        drawArrowHead(ctx, s.x2, s.y2, d.dx, d.dy);
      }

      // Selected highlight
      if (s.id === selectedId) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.quadraticCurveTo(s.cx, s.cy, s.x2, s.y2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draw accessories (with attachment override)
    for (const s of frame.shapes) {
      if (s.type === "path") continue;
      const pos = attachedPos.get(s.id);
      const x = pos?.x ?? ("x" in s ? s.x : 0);
      const y = pos?.y ?? ("y" in s ? s.y : 0);

      ctx.save();
      ctx.fillStyle = s.color;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = Math.max(1, s.width);

      if (s.type === "player") {
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (s.type === "cone") {
        ctx.beginPath();
        ctx.moveTo(x, y - s.size);
        ctx.lineTo(x - s.size * 0.9, y + s.size);
        ctx.lineTo(x + s.size * 0.9, y + s.size);
        ctx.closePath();
        ctx.fill();
      } else if (s.type === "ball") {
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "white";
        ctx.fill();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, s.r * 0.25), 0, Math.PI * 2);
        ctx.fill();
      } else if (s.type === "text") {
        ctx.font = "700 14px ui-sans-serif, system-ui";
        ctx.fillStyle = s.color;
        ctx.fillText(s.text, x, y);
      }

      if (s.id === selectedId) {
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Draft preview
    const draft = draftRef.current;
    if (draft && draft.type === "path") {
      ctx.save();
      ctx.strokeStyle = draft.color;
      ctx.lineWidth = draft.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = 0.85;
      if (draft.style === "dashed") ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);
      if (draft.style === "wavy") {
        drawWavyQuad(ctx, draft.x1, draft.y1, draft.cx, draft.cy, draft.x2, draft.y2, 4, 22);
      } else {
        ctx.beginPath();
        ctx.moveTo(draft.x1, draft.y1);
        ctx.quadraticCurveTo(draft.cx, draft.cy, draft.x2, draft.y2);
        ctx.stroke();
      }
      if (draft.arrow) {
        const d = derivOnQuad(draft.x1, draft.y1, draft.cx, draft.cy, draft.x2, draft.y2, 0.995);
        drawArrowHead(ctx, draft.x2, draft.y2, d.dx, d.dy);
      }
      ctx.restore();
    }
  }

  function drawTemplateBackground(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    t: CanvasTemplate
  ) {
    // Crop
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    const sx = t.crop === "half" ? 0 : 0;
    const sw = t.crop === "half" ? Math.floor(srcW / 2) : srcW;
    const sy = 0;
    const sh = srcH;

    // Contain fit (smaller rink)
    const pad = 0.92;
    const scale = Math.min((w * pad) / sw, (h * pad) / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((t.rotationDeg * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  // Playback loop (requestAnimationFrame)
  useEffect(() => {
    if (!doc || doc.kind !== "animation" || !isPlaying) return;

    let raf = 0;
    playRef.current = { frameStart: performance.now() };

    const tick = (now: number) => {
      if (!doc) return;
      const frame = doc.frames[Math.min(activeFrameIndex, doc.frames.length - 1)]!;
      const dur = Math.max(200, frame.durationMs);
      const start = playRef.current?.frameStart ?? now;
      if (now - start >= dur) {
        playRef.current = { frameStart: now };
        setActiveFrameIndex((i) => (i + 1) % doc.frames.length);
      }
      redraw(now);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isPlaying, activeFrameIndex]);

  // Redraw on key deps
  useEffect(() => {
    redraw(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerSize.w, containerSize.h, doc?.template.crop, doc?.template.rotationDeg, activeFrameIndex, selectedId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Taktiktavle</h1>
          <div className="text-sm text-zinc-600">Tegn taktik og øvelser som billeder eller animationer.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => createNew("image")}
            className="rounded-md bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
          >
            Opret Billede
          </button>
          <button
            type="button"
            onClick={() => createNew("animation")}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold"
          >
            Opret Animation
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={!doc || past.length === 0}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!doc || future.length === 0}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={exportPng}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Download PNG
          </button>
          <button
            type="button"
            onClick={exportJson}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Eksportér JSON
          </button>
          <button
            type="button"
            onClick={clearFrame}
            disabled={!doc}
            className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Ryd
          </button>
        </div>
      </div>

      {doc ? (
        <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <input
                value={doc.name}
                onChange={(e) => setDoc((d) => (d ? { ...d, name: e.target.value } : d))}
                className="w-full max-w-[420px] rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1 text-sm"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Lærred: {templateLabel(doc.template)}
                {doc.kind === "animation" && selectedShape && selectedShape.type !== "path" ? (
                  <> • Tilknyt ved linje: {selectedShape.type}</>
                ) : null}
              </div>
            </div>

            {doc.kind === "animation" ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying((p) => !p);
                    playRef.current = { frameStart: performance.now() };
                  }}
                  className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
                >
                  {isPlaying ? "Stop" : "Afspil"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div ref={containerRef} className="mx-auto max-w-[980px] rounded-md border border-[color:var(--surface-border)] bg-white p-3">
        <canvas
          ref={canvasRef}
          className="block w-full rounded-md border border-zinc-200"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>

      {doc && doc.kind === "animation" ? (
        <div className="rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Frames</div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addFrame}
                className="rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-[var(--brand-foreground)]"
              >
                Ny frame
              </button>
              <button
                type="button"
                onClick={duplicateFrame}
                className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm font-semibold"
              >
                Duplikér
              </button>
              <button
                type="button"
                onClick={deleteFrame}
                disabled={doc.frames.length <= 1}
                className="rounded-md border border-[color:var(--surface-border)] bg-transparent px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                Slet
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {doc.frames.map((f, idx) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setActiveFrameIndex(idx);
                  playRef.current = { frameStart: performance.now() };
                }}
                className={
                  "rounded-md px-3 py-2 text-sm font-semibold " +
                  (idx === activeFrameIndex
                    ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                    : "border border-[color:var(--surface-border)]")
                }
              >
                Frame {idx + 1}
              </button>
            ))}
          </div>

          {activeFrame ? (
            <div className="mt-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-xs font-semibold opacity-80">Varighed (sek)</span>
                <input
                  type="number"
                  min={0.2}
                  step={0.1}
                  value={(activeFrame.durationMs / 1000).toFixed(1)}
                  onChange={(e) => {
                    const next = Math.max(0.2, Number(e.target.value || 1.5));
                    applyMutation((d) => {
                      const frames = [...d.frames];
                      frames[activeFrameIndex] = { ...frames[activeFrameIndex]!, durationMs: Math.round(next * 1000) };
                      return { ...d, frames };
                    });
                  }}
                  className="w-24 rounded-md border border-[color:var(--surface-border)] bg-transparent px-2 py-1 text-sm"
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Vælg lærred</div>
                <div className="text-sm text-zinc-600">Fuld/halv bane + rotation.</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectOpen(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-semibold"
              >
                Luk
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Bane</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingCrop("full")}
                    className={
                      "rounded-md px-3 py-2 text-sm font-semibold " +
                      (pendingCrop === "full"
                        ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : "border border-zinc-200")
                    }
                  >
                    Fuld bane
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingCrop("half")}
                    className={
                      "rounded-md px-3 py-2 text-sm font-semibold " +
                      (pendingCrop === "half"
                        ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : "border border-zinc-200")
                    }
                  >
                    Halv bane
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Rotation</div>
                <div className="flex flex-wrap gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <button
                      key={deg}
                      type="button"
                      onClick={() => setPendingRotation(deg as CanvasTemplate["rotationDeg"])}
                      className={
                        "rounded-md px-3 py-2 text-sm font-semibold " +
                        (pendingRotation === deg
                          ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                          : "border border-zinc-200")
                      }
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
                Valgt: {pendingCrop === "full" ? "Fuld bane" : "Halv bane"} • Rotation {pendingRotation}°
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={confirmTemplate}
                  className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-[var(--brand-foreground)]"
                >
                  Opret
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
