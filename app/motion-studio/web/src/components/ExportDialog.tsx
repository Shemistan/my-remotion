// Экспорт версии: MP4 (H.264 + AAC) или ProRes 4444 с альфой — только для версии, сделанной
// с прозрачным фоном (`settings.transparent_export`, H4); FPS (смена — с пересчётом темпа,
// может отказать), качество (CRF), масштаб. Один ключ идемпотентности на открытие диалога.
import type { ExportRequest, Job, Settings } from "@ms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, newKey } from "../api/client.js";
import { errorText, t } from "../i18n/index.js";
import { formatFps } from "../lib/player-math.js";

export interface ExportDialogProps {
  versionId: string;
  settings: Settings;
  onClose: () => void;
  onCreated: (job: Job) => void;
}

const FPS = [24, 25, 30, 50, 60] as const;
const CRF = [14, 16, 18, 20, 23, 28] as const;

export function ExportDialog({ versionId, settings, onClose, onCreated }: ExportDialogProps) {
  const id = useId();
  const [key] = useState(newKey);
  const transparent = settings.transparent_export === true;
  const [format, setFormat] = useState<ExportRequest["format"]>("mp4");
  const [fps, setFps] = useState<string>("");
  const [crf, setCrf] = useState(18);
  const [scale, setScale] = useState<1 | 0.5>(1);
  const start = useMutation({
    mutationFn: () => {
      const req: ExportRequest = { format, ...(fps ? { fps: Number(fps) as ExportRequest["fps"] } : {}), crf, scale } as ExportRequest;
      return api.exportVersion(versionId, req, key);
    },
    onSuccess: (r) => onCreated(r.job),
  });

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{t("export.title")}</h2>
        <fieldset className="radio-group">
          <legend>{t("export.format")}</legend>
          <label>
            <input type="radio" name={`${id}-format`} checked={format === "mp4"} onChange={() => setFormat("mp4")} />
            {t("export.format.mp4")}
          </label>
          <label className={transparent ? "" : "disabled"}>
            <input type="radio" name={`${id}-format`} checked={format === "prores4444"} disabled={!transparent} onChange={() => setFormat("prores4444")} />
            {t("export.format.prores4444")}
          </label>
          {!transparent ? <p className="hint">{t("export.proresUnavailable")}</p> : null}
        </fieldset>
        <div className="form-row">
          <label htmlFor={`${id}-fps`}>{t("export.fps")}</label>
          <select id={`${id}-fps`} value={fps} onChange={(e) => setFps(e.target.value)}>
            <option value="">{t("export.fpsSame", { fps: formatFps(settings.fps) })}</option>
            {FPS.map((f) => <option key={f} value={String(f)}>{String(f)}</option>)}
          </select>
          {fps ? <span className="hint">{t("export.fpsHint")}</span> : null}
        </div>
        <div className="form-row">
          <label htmlFor={`${id}-crf`}>{t("export.quality")}</label>
          <select id={`${id}-crf`} value={String(crf)} onChange={(e) => setCrf(Number(e.target.value))}>
            {CRF.map((c) => <option key={c} value={String(c)}>{t("export.crf", { crf: c })}</option>)}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor={`${id}-scale`}>{t("export.scale")}</label>
          <select id={`${id}-scale`} value={String(scale)} onChange={(e) => setScale(e.target.value === "0.5" ? 0.5 : 1)}>
            <option value="1">{t("export.scaleFull", { size: `${settings.width}×${settings.height}` })}</option>
            <option value="0.5">{t("export.scaleHalf", { size: `${Math.round(settings.width / 2)}×${Math.round(settings.height / 2)}` })}</option>
          </select>
        </div>
        {start.isError ? <p className="error">{errorText(start.error)}</p> : null}
        <div className="row end">
          <button type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={start.isPending} onClick={() => start.mutate()}>{t("export.start")}</button>
        </div>
      </div>
    </div>
  );
}
