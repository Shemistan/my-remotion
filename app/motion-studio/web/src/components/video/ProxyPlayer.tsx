// Плеер видеопроекта со звуком: «Исходник» — прокси; «После монтажа» — превью ревизии EDL, а
// пока его нет — прокси с пропуском вырезок (`cutAt` → переход на конец вырезки). Наружу —
// время в source (µs) для подсветки слова и курсоров; `seekSource` и `playRange` (прослушать
// фрагмент вокруг вырезки). Время плеера округляется и ограничивается до перевода (m7).
import type { EdlDto, Fps } from "@ms/contracts";
import { type Ref, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { urls } from "../../api/client.js";
import { t } from "../../i18n/index.js";
import { cutAt, formatTimecode, frameOf, playerUs, toEdited, toSource } from "../../video/use-timeline.js";

export type PlayerMode = "source" | "edited";

export interface ProxyPlayerHandle {
  seekSource(us: number): void;
  playRange(range: { start_us: number; end_us: number }): void;
}

export interface ProxyPlayerProps {
  ref?: Ref<ProxyPlayerHandle>;
  mediaId: string;
  durationUs: number;
  fps: Fps;
  width: number;
  height: number;
  edl?: EdlDto | undefined;
  onTime?: (sourceUs: number) => void;
}

export function ProxyPlayer({ ref, mediaId, durationUs, fps, width, height, edl, onTime }: ProxyPlayerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<PlayerMode>("source");
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(0);
  const [range, setRange] = useState<{ start_us: number; end_us: number } | null>(null);
  const tl = edl?.timeline;
  const preview = mode === "edited" && edl?.preview_ready ? edl : undefined;
  const skipCuts = mode === "edited" && !preview && tl !== undefined;
  const src = preview ? urls.edlPreview(preview.id, preview.doc.revision) : urls.proxy(mediaId);
  const timeAxisMax = preview && tl ? tl.duration_us : durationUs;

  /** Время `<video>` → source µs (в превью — через таймлайн ревизии). */
  const sourceOf = useCallback((seconds: number) => {
    const us = playerUs(seconds, timeAxisMax);
    return preview && tl ? toSource(tl, us) : us;
  }, [preview, tl, timeAxisMax]);

  const tick = useCallback(() => {
    const v = video.current;
    if (!v) return;
    let s = sourceOf(v.currentTime);
    if (skipCuts && tl && !v.paused) {
      const cut = cutAt(tl, s);
      if (cut) {
        v.currentTime = cut.end_us / 1_000_000;
        s = cut.end_us;
      }
    }
    if (range && s >= range.end_us) {
      v.pause();
      setRange(null);
    }
    setShown(mode === "edited" && tl ? toEdited(tl, s).us : s);
    onTime?.(s);
  }, [sourceOf, skipCuts, tl, range, mode, onTime]);

  useEffect(() => {
    const v = video.current;
    if (!v || !playing || typeof v.requestVideoFrameCallback !== "function") return;
    let h = 0;
    const loop = () => {
      tick();
      h = v.requestVideoFrameCallback(loop);
    };
    h = v.requestVideoFrameCallback(loop);
    return () => v.cancelVideoFrameCallback(h);
  }, [playing, tick]);

  const seekSource = useCallback((us: number) => {
    const v = video.current;
    if (!v) return;
    const s = Math.min(Math.max(0, Math.round(us)), durationUs);
    v.currentTime = (preview && tl ? toEdited(tl, s).us : s) / 1_000_000;
    setShown(mode === "edited" && tl ? toEdited(tl, s).us : s);
    onTime?.(s);
  }, [preview, tl, durationUs, mode, onTime]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play()?.catch(() => setPlaying(false));
    else v.pause();
  };

  // смена режима и «Прослушать фрагмент»: то же место в source — когда новый src готов (или
  // сразу, если src тот же); фрагмент после перехода ещё и запускается
  const pending = useRef<{ us: number; play: boolean } | null>(null);
  const applyPending = () => {
    const v = video.current;
    if (pending.current === null || !v || v.readyState < 1 || !v.currentSrc.endsWith(src)) return;
    const p = pending.current;
    pending.current = null;
    seekSource(p.us);
    if (p.play) void v.play()?.catch(() => setPlaying(false));
  };
  useEffect(applyPending);

  useImperativeHandle(ref, () => ({
    seekSource,
    playRange(r) {
      video.current?.pause();
      pending.current = { us: r.start_us, play: true };
      setRange(r);
      setMode("source");
    },
  }), [seekSource]);

  const switchMode = (m: PlayerMode) => {
    const v = video.current;
    pending.current = { us: v ? sourceOf(v.currentTime) : 0, play: false };
    v?.pause();
    setRange(null);
    setMode(m);
  };

  const axisFps = fps;
  return (
    <section className="panel proxy-player" data-mode={mode}>
      <div className="row wrap">
        <div className="segmented" role="radiogroup" aria-label={t("video.player.mode")}>
          {(["source", "edited"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "active" : ""} disabled={m === "edited" && !tl} onClick={() => switchMode(m)}>
              {t(m === "source" ? "video.player.source" : "video.player.edited")}
            </button>
          ))}
        </div>
        {mode === "edited" && edl ? (
          <span className="muted small" data-testid="player-note">
            {preview ? t("video.player.previewNote", { n: preview.doc.revision }) : t("video.player.skipNote")}
          </span>
        ) : null}
        {range ? <span className="muted small">{t("video.player.listening", { from: formatTimecode(range.start_us), to: formatTimecode(range.end_us) })}</span> : null}
      </div>
      <div className="player-stage" style={{ aspectRatio: `${width} / ${height}` }}>
        <video
          ref={video}
          src={src}
          preload="auto"
          playsInline
          onClick={toggle}
          onLoadedMetadata={applyPending}
          onTimeUpdate={tick}
          onSeeked={tick}
          onPlay={() => setPlaying(true)}
          onPause={() => { setPlaying(false); tick(); }}
          onEnded={() => setPlaying(false)}
        />
      </div>
      <div className="player-controls">
        <button type="button" className="primary" onClick={toggle} aria-label={playing ? t("player.pause") : t("player.play")}>
          {playing ? t("player.pause") : t("player.play")}
        </button>
        <span className="mono" data-testid="player-time">
          {t("video.player.time", { tc: formatTimecode(shown), frame: frameOf(shown, axisFps) })}
        </span>
      </div>
    </section>
  );
}
