// Сведения об исходнике: длительность, кадр, fps (30000/1001 → «29,97»), VFR, поворот, звук,
// размер, sha256 (первые 12 символов) и оригинал «только чтение».
import type { MediaDto } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { formatFps } from "../../lib/player-math.js";
import { formatTimecode } from "../../video/use-timeline.js";

export function MediaInfo({ media }: { media: MediaDto }) {
  const { asset } = media;
  const p = asset.probe;
  const rows: [string, string][] = [
    [t("media.duration"), formatTimecode(p.duration_us)],
    [t("media.frameSize"), `${p.video.display_width}×${p.video.display_height}`],
    [t("media.fps"), t("media.fpsValue", { fps: formatFps(p.timeline_fps) })],
    [t("media.vfr"), p.vfr ? t("media.vfrYes") : t("media.vfrNo")],
    [t("media.rotation"), t("media.rotationValue", { deg: p.video.rotation })],
    [t("media.audio"), p.audio ? t("media.audioValue", { codec: p.audio.codec, rate: p.audio.sample_rate, ch: p.audio.channels }) : t("media.noAudio")],
    [t("media.fileSize"), t("media.mb", { n: (asset.size_bytes / 1e6).toFixed(1).replace(".", ",") })],
    [t("media.sha"), asset.sha256.slice(0, 12)],
  ];
  return (
    <section className="panel media-info" data-testid="media-info">
      <h2>{t("media.info")}</h2>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </div>
        ))}
        <div>
          <dt>{t("media.original")}</dt>
          <dd>
            <span className="mono wrap-any">{asset.import.source_path ?? asset.original_name}</span>{" "}
            <span className="badge">{t("media.readOnly")}</span>{" "}
            <span className="muted small">{t(`media.method.${asset.import.method}`)}</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
