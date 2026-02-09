export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function parseClock(input: string): number | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (nums.length === 1) {
    return nums[0] ?? null;
  }

  if (nums.length === 2) {
    const [m, s] = nums as [number, number];
    return m * 60 + s;
  }

  if (nums.length === 3) {
    const [h, m, s] = nums as [number, number, number];
    return h * 3600 + m * 60 + s;
  }

  return null;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
