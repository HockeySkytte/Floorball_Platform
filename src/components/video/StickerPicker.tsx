"use client";

import { STICKERS } from "@/components/video/stickers";

export default function StickerPicker({
  value,
  onChange,
  color,
}: {
  value: string;
  onChange: (id: string) => void;
  color: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <div className="text-xs font-semibold text-zinc-700">Symboler</div>
      <div className="mt-2 grid grid-cols-6 gap-2">
        {STICKERS.map((s) => {
          const selected = s.id === value;
          return (
            <button
              key={s.id}
              type="button"
              className={
                "flex aspect-square items-center justify-center rounded-md border " +
                (selected ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-white hover:bg-zinc-50")
              }
              onClick={() => onChange(s.id)}
              title={s.label}
            >
              <svg viewBox="0 0 24 24" width={22} height={22}>
                {s.render({ color })}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
