// Сравнение двух версий: два <video> рядом с общим seek и общим play/pause (во время
// воспроизведения ведущее видео — более длинное: счётчик и ползунок идут за ним, второе
// подтягивается при расхождении больше кадра); различия
// settings/props/spec (JSON Pointer, было → стало) и файлов src/ (unified diff как текст).
import type { JsonChange, VersionDto } from "@ms/contracts";
import { type RefObject, useEffect, useRef, useState } from "react";
import { urls } from "../api/client.js";
import { useDiff, useVersion } from "../api/queries.js";
import { errorText, t } from "../i18n/index.js";
import { clampFrame, frameToTime, timeToFrame } from "../lib/player-math.js";
import { Skeleton } from "./ui/Skeleton.js";

export interface VersionCompareProps {
  a: string;
  b: string;
}

const show = (v: unknown): string => (v === undefined ? t("compare.absent") : typeof v === "string" ? v : JSON.stringify(v));

function Changes({ title, list }: { title: string; list: JsonChange[] }) {
  return (
    <section className="diff-block">
      <h3>{title}</h3>
      {list.length === 0 ? <p className="muted">{t("compare.noChanges")}</p> : (
        <table className="diff-table">
          <thead><tr><th>{t("compare.path")}</th><th>{t("compare.before")}</th><th>{t("compare.after")}</th></tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.path}>
                <td className="mono">{c.path}</td>
                <td className="mono before">{show(c.before)}</td>
                <td className="mono after">{show(c.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

interface SideProps {
  dto: VersionDto | undefined;
  video: RefObject<HTMLVideoElement | null>;
  label: string;
  onTimeUpdate: () => void;
  onEnded: () => void;
}

function Side({ dto, video, label, onTimeUpdate, onEnded }: SideProps) {
  const m = dto?.manifest;
  return (
    <figure className="compare-side">
      <figcaption>{label}</figcaption>
      <div className="player-stage" style={m ? { aspectRatio: `${m.settings.width} / ${m.settings.height}` } : undefined}>
        {m?.preview ? <video ref={video} src={urls.preview(m.version_id)} preload="auto" muted playsInline onTimeUpdate={onTimeUpdate} onEnded={onEnded} /> : <div className="no-preview">{t("player.noPreview")}</div>}
      </div>
    </figure>
  );
}

export function VersionCompare({ a, b }: VersionCompareProps) {
  const va = useVersion(a);
  const vb = useVersion(b);
  const diff = useDiff(a, b);
  const refA = useRef<HTMLVideoElement>(null);
  const refB = useRef<HTMLVideoElement>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sa = va.data?.settings;
  const sb = vb.data?.settings;
  const duration = Math.max(sa?.duration_frames ?? 1, sb?.duration_frames ?? 1);

  const seek = (f: number) => {
    const target = clampFrame(f, duration);
    for (const [v, s] of [[refA.current, sa], [refB.current, sb]] as const) {
      if (!v || !s) continue;
      v.pause();
      v.currentTime = frameToTime(Math.min(target, s.duration_frames - 1), s.fps);
    }
    setPlaying(false);
    setFrame(target);
  };
  const bLeads = Boolean(sa && sb && sb.duration_frames > sa.duration_frames);
  /** Кадр по ведущему видео; второе подтягивается, если разошлось больше чем на кадр. */
  const sync = () => {
    const [lv, ls, fv, fs] = bLeads ? [refB.current, sb, refA.current, sa] : [refA.current, sa, refB.current, sb];
    if (!lv || !ls) return;
    setFrame(clampFrame(timeToFrame(lv.currentTime, ls.fps), duration));
    if (fv && fs) {
      const end = (fs.duration_frames * fs.fps.den) / fs.fps.num;
      const target = Math.min(lv.currentTime, end);
      if (Math.abs(fv.currentTime - target) > fs.fps.den / fs.fps.num) fv.currentTime = target;
    }
  };
  const playingRef = useRef(false);
  playingRef.current = playing;
  const syncRef = useRef(sync);
  syncRef.current = sync;
  // между событиями timeupdate (≈4 раза в секунду) счётчик обновляется по кадрам отрисовки
  useEffect(() => {
    if (!playing || typeof requestAnimationFrame !== "function") return;
    let id = 0;
    const tick = () => {
      syncRef.current();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing]);
  const onTimeUpdate = () => {
    if (playingRef.current) sync();
  };
  const onEnded = () => {
    sync();
    setPlaying(false);
  };
  const toggle = () => {
    const vids = [refA.current, refB.current].filter((v): v is HTMLVideoElement => Boolean(v));
    if (playing) {
      for (const v of vids) v.pause();
      sync();
      setPlaying(false);
    } else {
      for (const v of vids) void v.play()?.catch(() => undefined);
      setPlaying(true);
    }
  };

  const label = (dto: VersionDto | undefined) => (dto ? t("versions.label", { n: dto.manifest.number }) : t("common.loading"));
  return (
    <div className="compare">
      <div className="compare-videos">
        <Side dto={va.data} video={refA} label={label(va.data)} onTimeUpdate={onTimeUpdate} onEnded={bLeads ? () => undefined : onEnded} />
        <Side dto={vb.data} video={refB} label={label(vb.data)} onTimeUpdate={onTimeUpdate} onEnded={bLeads ? onEnded : () => undefined} />
      </div>
      <div className="player-controls">
        <button type="button" onClick={() => seek(frame - 1)} aria-label={t("player.prev")}>{"◀︎|"}</button>
        <button type="button" className="primary" onClick={toggle}>{playing ? t("player.pause") : t("player.play")}</button>
        <button type="button" onClick={() => seek(frame + 1)} aria-label={t("player.next")}>{"|▶︎"}</button>
        <input type="range" className="seek" min={0} max={duration - 1} value={frame} aria-label={t("player.seek")} onChange={(e) => seek(Number(e.target.value))} />
        <span className="mono frame-counter">{t("player.frame", { frame, total: duration })}</span>
      </div>
      {diff.isError ? <p className="error">{errorText(diff.error)}</p> : null}
      {diff.data ? (
        <div className="diff">
          <Changes title={t("compare.settings")} list={diff.data.settings} />
          <Changes title={t("compare.props")} list={diff.data.props} />
          <Changes title={t("compare.spec")} list={diff.data.spec} />
          <section className="diff-block">
            <h3>{t("compare.files")}</h3>
            <ul className="file-diffs">
              {diff.data.files.map((f) => (
                <li key={f.path}>
                  <div className="row">
                    <span className="mono">{f.path}</span>
                    <span className={`badge file-${f.status}`}>{t(`compare.file.${f.status}`)}</span>
                  </div>
                  {f.unified ? <pre className="log small unified" tabIndex={0} aria-label={t("compare.title")}>{f.unified}</pre> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <Skeleton lines={5} />
      )}
    </div>
  );
}
