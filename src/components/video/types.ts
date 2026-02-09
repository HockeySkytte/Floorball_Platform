export type VideoClipPause = {
  id: string;
  atSec: number; // absolute (match) seconds
  durationSec: number;
};

export type VideoOverlayBase = {
  id: string;
  startSec: number; // absolute (match) seconds
  endSec: number; // absolute (match) seconds
  color: string;
};

export type VideoOverlayText = VideoOverlayBase & {
  type: "text";
  x: number; // 0..1
  y: number; // 0..1
  text: string;
  fontSize: number; // px at 1080p-ish baseline
};

export type VideoOverlayArrow = VideoOverlayBase & {
  type: "arrow";
  kind?: "line" | "curve";
  style?: "solid" | "dashed" | "wavy";
  x1: number;
  y1: number;
  cx?: number;
  cy?: number;
  x2: number;
  y2: number;
  width: number;
  manualControl?: boolean;
};

export type VideoOverlayCircle = VideoOverlayBase & {
  type: "circle";
  cx: number;
  cy: number;
  r: number;
  width: number;
};

export type VideoOverlayPen = VideoOverlayBase & {
  type: "pen";
  points: { x: number; y: number }[];
  width: number;
};

export type VideoOverlaySticker = VideoOverlayBase & {
  type: "sticker";
  x: number; // 0..1
  y: number; // 0..1
  stickerId: string;
  size: number; // px at 1080p-ish baseline
  rotation: number; // deg
};

export type VideoOverlay =
  | VideoOverlayText
  | VideoOverlayArrow
  | VideoOverlayCircle
  | VideoOverlayPen
  | VideoOverlaySticker;

export type VideoClipDocV1 = {
  version: 1;
  matchId: string;
  matchTitle: string;
  videoUrl: string;
  clipName?: string;
  startSec: number;
  endSec: number;
  pauses: VideoClipPause[];
  overlays: VideoOverlay[];
};
