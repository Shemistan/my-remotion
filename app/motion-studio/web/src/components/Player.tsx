// Плеер превью версии: ровно то, что отрендерено (`preview.mp4` в <video>), без Remotion
// Player в браузере (`03` §3). Play/pause, seek по кадрам, шаг ±1 кадр, номер кадра, сведения
// о кадре (соотношение, размер, FPS, длительность). `seek(frame)` — для QA и таймлайна.
import type { Fps } from "@ms/contracts";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { t } from "../i18n/index.js";
import { clampFrame, formatDuration, formatFps, frameToTime, timeToFrame } from "../lib/player-math.js";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
/** Соотношение сторон по размеру кадра: 1920×1080 → 16:9. */
export const ratioOf = (w: number, h: number): string => `${w / gcd(w, h)}:${h / gcd(w, h)}`;

export interface PlayerHandle {
  seek(frame: number): void;
}

export interface PlayerProps {
  ref?: Ref<PlayerHandle>;
  src: string;
  fps: Fps;
  durationFrames: number;
  width: number;
  height: number;
  aspectRatio?: string;
  onFrame?: (frame: number) => void;
}

export function Player({ ref, src, fps, durationFrames, width, height, aspectRatio, onFrame }: PlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  const show = useCallback((f: number) => {
    setFrame(f);
    onFrame?.(f);
  }, [onFrame]);

  const seek = useCallback((f: number) => {
    const target = clampFrame(f, durationFrames);
    const v = video.current;
    if (v) {
      v.pause();
      v.currentTime = frameToTime(target, fps);
    }
    setPlaying(false);
    show(target);
  }, [durationFrames, fps, show]);

  useImperativeHandle(ref, () => ({ seek }), [seek]);

  // во время проигрывания номер кадра — по кадрам видео (requestVideoFrameCallback), иначе timeupdate
  useEffect(() => {
    const v = video.current;
    if (!v || !playing || typeof v.requestVideoFrameCallback !== "function") return;
    let handle = 0;
    const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
      show(clampFrame(timeToFrame(meta.mediaTime, fps), durationFrames));
      handle = v.requestVideoFrameCallback(tick);
    };
    handle = v.requestVideoFrameCallback(tick);
    return () => v.cancelVideoFrameCallback(handle);
  }, [playing, fps, durationFrames, show]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      void v.play()?.catch(() => setPlaying(false));
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
      // кадр паузы — сразу по currentTime: шаг ±1 считается от него, а не от последнего rVFC
      show(clampFrame(timeToFrame(v.currentTime, fps), durationFrames));
    }
  };

  const ratio = aspectRatio ?? ratioOf(width, height);
  return (
    <div className="player">
      <div className="player-stage" style={{ aspectRatio: `${width} / ${height}` }}>
        <video
          ref={video}
          src={src}
          preload="auto"
          playsInline
          muted
          onClick={toggle}
          onTimeUpdate={(e) => show(clampFrame(timeToFrame(e.currentTarget.currentTime, fps), durationFrames))}
          onPause={(e) => {
            setPlaying(false);
            show(clampFrame(timeToFrame(e.currentTarget.currentTime, fps), durationFrames));
          }}
          onPlay={() => setPlaying(true)}
          onEnded={() => setPlaying(false)}
        />
      </div>
      <div className="player-controls">
        <button type="button" onClick={() => seek(frame - 1)} aria-label={t("player.prev")} title={t("player.prev")}>
          {"◀︎|"}
        </button>
        <button type="button" className="primary" onClick={toggle} aria-label={playing ? t("player.pause") : t("player.play")}>
          {playing ? t("player.pause") : t("player.play")}
        </button>
        <button type="button" onClick={() => seek(frame + 1)} aria-label={t("player.next")} title={t("player.next")}>
          {"|▶︎"}
        </button>
        <input
          type="range"
          className="seek"
          min={0}
          max={Math.max(0, durationFrames - 1)}
          step={1}
          value={frame}
          aria-label={t("player.seek")}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="mono frame-counter" data-testid="frame">{t("player.frame", { frame, total: durationFrames })}</span>
      </div>
      <div className="player-info muted" data-testid="player-info">
        <span>{ratio}</span>
        <span>{`${width}×${height}`}</span>
        <span>{t("player.fps", { fps: formatFps(fps) })}</span>
        <span>{t("player.duration", { seconds: formatDuration(durationFrames, fps), frames: durationFrames })}</span>
      </div>
    </div>
  );
}
