"use client";
import { useEffect, useRef, useState } from "react";

const SPEEDS = [1, 1.25, 1.5, 2] as const;

function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Glass audio player for a call recording, streamed from /api/recordings/<call id>. */
export function RecordingPlayer({ callId, durationSec }: { callId: string; durationSec?: number | null }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number>(durationSec ?? 0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const src = `/api/recordings/${callId}`;

  useEffect(() => {
    const el = audio.current;
    if (!el) return;
    const onTime = () => setTime(el.currentTime);
    const onMeta = () => {
      // Streamed Ogg often reports Infinity: keep the call duration from the webhook in that case.
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWaiting = () => setState("loading");
    const onReady = () => setState("idle");
    const onError = () => {
      setPlaying(false);
      setState("error");
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("waiting", onWaiting);
    el.addEventListener("playing", onReady);
    el.addEventListener("canplay", onReady);
    el.addEventListener("error", onError);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("waiting", onWaiting);
      el.removeEventListener("playing", onReady);
      el.removeEventListener("canplay", onReady);
      el.removeEventListener("error", onError);
    };
  }, []);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setState("loading");
      el.play().catch(() => setState("error"));
    } else el.pause();
  };

  const seek = (v: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = v;
    setTime(v);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const max = Math.max(duration, time, 1);

  return (
    <div className="glass rounded-2xl p-3.5 sm:p-4" role="group" aria-label="Call recording">
      <audio ref={audio} src={src} preload="metadata" />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={state === "error"}
          aria-label={playing ? "Pause recording" : "Play recording"}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40"
        >
          {state === "loading" && playing === false ? (
            <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
          ) : playing ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={max}
            step={0.1}
            value={Math.min(time, max)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek in recording"
            aria-valuetext={`${clock(time)} of ${clock(max)}`}
            disabled={state === "error"}
            className="h-1.5 w-full cursor-pointer accent-[#111827] disabled:opacity-40"
          />
          <div className="mt-1 flex items-center justify-between text-[11px] tabular-nums text-mute">
            <span>{clock(time)}</span>
            <span>{clock(max)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed} times, change`}
          className="w-12 shrink-0 rounded-full border border-line bg-white/70 py-1 text-xs font-medium tabular-nums text-ink transition-colors hover:bg-white"
        >
          {speed}×
        </button>
        <a
          href={src}
          download
          aria-label="Download recording"
          className="hidden shrink-0 text-xs text-mute underline underline-offset-4 transition-colors hover:text-ink sm:inline"
        >
          Download
        </a>
      </div>
      {state === "error" && (
        <p role="alert" className="mt-2 text-xs text-alert">
          The recording could not be loaded. Vaani may still be processing it; try again in a minute.
        </p>
      )}
    </div>
  );
}
