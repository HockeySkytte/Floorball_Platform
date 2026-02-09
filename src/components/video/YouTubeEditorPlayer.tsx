"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { loadYouTubeIframeApi, parseYouTubeId } from "@/components/video/youtube";

export type YouTubeEditorPlayerHandle = {
  play: () => void;
  pause: () => void;
  seekTo: (sec: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
};

type YTPlayer = {
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (sec: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  destroy?: () => void;
};

type YTPlayerOptions = {
  videoId: string;
  playerVars: {
    autoplay: 0 | 1;
    rel: 0 | 1;
    modestbranding: 0 | 1;
    playsinline: 0 | 1;
    controls: 0 | 1;
  };
  events?: {
    onReady?: () => void;
    onStateChange?: (e: { data: number }) => void;
  };
};

type YTGlobal = {
  Player: new (host: HTMLElement, options: YTPlayerOptions) => YTPlayer;
};

type YouTubeWindow = Window & {
  YT?: YTGlobal;
};

export default function YouTubeEditorPlayer({
  videoUrl,
  onReady,
  onStateChange,
  playerRef,
  overlay,
  overlayPointerEvents,
}: {
  videoUrl: string;
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  playerRef?: React.Ref<YouTubeEditorPlayerHandle | null>;
  overlay?: React.ReactNode;
  overlayPointerEvents?: "auto" | "none";
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const ytId = useMemo(() => parseYouTubeId(videoUrl), [videoUrl]);
  const onReadyRef = useRef<typeof onReady>(onReady);
  const onStateChangeRef = useRef<typeof onStateChange>(onStateChange);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useImperativeHandle(
    playerRef,
    () => ({
      play: () => {
        try {
          ytPlayerRef.current?.playVideo?.();
        } catch {
          // ignore
        }
      },
      pause: () => {
        try {
          ytPlayerRef.current?.pauseVideo?.();
        } catch {
          // ignore
        }
      },
      seekTo: (sec) => {
        const s = Number.isFinite(sec) ? Math.max(0, sec) : 0;
        try {
          ytPlayerRef.current?.seekTo?.(s, true);
        } catch {
          // ignore
        }
      },
      getCurrentTime: () => {
        try {
          const t = ytPlayerRef.current?.getCurrentTime?.();
          return typeof t === "number" && Number.isFinite(t) ? t : 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          const d = ytPlayerRef.current?.getDuration?.();
          return typeof d === "number" && Number.isFinite(d) ? d : 0;
        } catch {
          return 0;
        }
      },
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;
    loadYouTubeIframeApi().then(() => {
      if (cancelled) return;
      setApiReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!apiReady) return;
    if (!ytId) return;
    if (!hostRef.current) return;

    const YT = (window as YouTubeWindow).YT;
    if (!YT?.Player) return;

    // Destroy previous player if any.
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy?.();
      } catch {
        // ignore
      }
      ytPlayerRef.current = null;
      hostRef.current.innerHTML = "";
    }

    ytPlayerRef.current = new YT.Player(hostRef.current, {
      videoId: ytId,
      playerVars: {
        autoplay: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        controls: 1,
      },
      events: {
        onReady: () => {
          try {
            onReadyRef.current?.();
          } catch {
            // ignore
          }
        },
        onStateChange: (e) => {
          try {
            onStateChangeRef.current?.(e?.data);
          } catch {
            // ignore
          }
        },
      },
    });
  }, [apiReady, ytId]);

  if (!ytId) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-700">
        Ugyldig YouTube URL.
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-200 bg-black">
      <div ref={hostRef} className="h-full w-full" />
      {overlay ? (
        <div className={"absolute inset-0 z-10 " + (overlayPointerEvents === "none" ? "pointer-events-none" : "")}>
          {overlay}
        </div>
      ) : null}
    </div>
  );
}
