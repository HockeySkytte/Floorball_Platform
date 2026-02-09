import type { VideoOverlaySticker } from "@/components/video/types";

export type StickerDef = {
  id: string;
  label: string;
  // Drawn in a 24x24 coordinate system.
  render: (opts: { color: string }) => React.ReactNode;
};

export const STICKERS: StickerDef[] = [
  {
    id: "target",
    label: "Target",
    render: ({ color }) => (
      <>
        <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.5" />
        <circle cx="12" cy="12" r="5" fill="none" stroke={color} strokeWidth="2.5" />
        <circle cx="12" cy="12" r="1.5" fill={color} />
      </>
    ),
  },
  {
    id: "check",
    label: "Check",
    render: ({ color }) => (
      <path
        d="M20 7 L10 17 L4 11"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "x",
    label: "X",
    render: ({ color }) => (
      <>
        <path d="M6 6 L18 18" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <path d="M18 6 L6 18" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "arrow",
    label: "Arrow",
    render: ({ color }) => (
      <>
        <path
          d="M4 12 H18"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M13 7 L18 12 L13 17"
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    id: "star",
    label: "Star",
    render: ({ color }) => (
      <path
        d="M12 3 L14.8 9.2 L21.5 9.7 L16.4 13.9 L18.0 20.5 L12 17.1 L6.0 20.5 L7.6 13.9 L2.5 9.7 L9.2 9.2 Z"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "exclamation",
    label: "!",
    render: ({ color }) => (
      <>
        <path d="M12 5 V14" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx="12" cy="18" r="1.6" fill={color} />
      </>
    ),
  },
];

export function getSticker(id: string | null | undefined): StickerDef | null {
  const key = String(id ?? "").trim();
  if (!key) return null;
  return STICKERS.find((s) => s.id === key) ?? null;
}

export function renderStickerSvg({
  overlay,
}: {
  overlay: VideoOverlaySticker;
}) {
  const def = getSticker(overlay.stickerId) ?? STICKERS[0]!;
  const s = Math.max(8, Number(overlay.size) || 64) / 1000; // convert px baseline -> normalized
  const half = s / 2;
  const x = overlay.x - half;
  const y = overlay.y - half;
  const rot = Number.isFinite(overlay.rotation) ? overlay.rotation : 0;

  // 24x24 -> normalized size `s`
  const scale = s / 24;
  const cx = overlay.x;
  const cy = overlay.y;

  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale}) rotate(${rot} ${12} ${12})`}
      opacity={1}
    >
      {def.render({ color: overlay.color })}
    </g>
  );
}
