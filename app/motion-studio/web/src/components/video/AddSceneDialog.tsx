// Сцена пользователя (Task 33): по выделенным в транскрипте словам — тип визуализации, режим, зона
// и назначение (обязательно) → операция плана `add` (время, кадры, прямоугольник и лицо считает сервер).
import { PATTERN_SLUGS, type PlanOp, type ScenePlanItem, type Zone } from "@ms/contracts";
import { useEffect, useId, useState } from "react";
import { t } from "../../i18n/index.js";
import { MODES, ZONES } from "./PlanInspector.js";

export interface AddSceneDialogProps {
  range: { start_word_id: string; end_word_id: string; text: string };
  busy: boolean;
  onSubmit: (op: Extract<PlanOp, { op: "add" }>) => void;
  onClose: () => void;
}

export function AddSceneDialog({ range, busy, onSubmit, onClose }: AddSceneDialogProps) {
  const ids = { title: useId(), type: useId(), mode: useId(), zone: useId(), purpose: useId() };
  const [visualType, setVisualType] = useState<ScenePlanItem["visual_type"]>("key-point-emphasis");
  const [mode, setMode] = useState<ScenePlanItem["composition_mode"]>("overlay");
  const [zone, setZone] = useState<Zone>("left_third");
  const [purpose, setPurpose] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const ready = purpose.trim() !== "" && !busy;
  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          onSubmit({ op: "add", start_word_id: range.start_word_id, end_word_id: range.end_word_id, visual_type: visualType, composition_mode: mode, zone, purpose: purpose.trim() });
        }}
      >
        <h2 id={ids.title}>{t("addScene.title")}</h2>
        <p className="muted small wrap-any">{t("addScene.words", { text: range.text })}</p>
        <label htmlFor={ids.type} className="small">{t("addScene.type")}</label>
        <select id={ids.type} value={visualType} onChange={(e) => setVisualType(e.target.value as ScenePlanItem["visual_type"])}>
          {PATTERN_SLUGS.map((p) => <option key={p} value={p}>{t(`pattern.${p}`)}</option>)}
        </select>
        <label htmlFor={ids.mode} className="small">{t("addScene.mode")}</label>
        <select id={ids.mode} value={mode} onChange={(e) => setMode(e.target.value as ScenePlanItem["composition_mode"])}>
          {MODES.map((m) => <option key={m} value={m}>{t(`plan.mode.${m}`)}</option>)}
        </select>
        <label htmlFor={ids.zone} className="small">{t("addScene.zone")}</label>
        <select id={ids.zone} value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
          {ZONES.map((z) => <option key={z} value={z}>{t(`zone.${z}`)}</option>)}
        </select>
        <label htmlFor={ids.purpose} className="small">{t("addScene.purpose")}</label>
        <input id={ids.purpose} value={purpose} placeholder={t("addScene.purposePlaceholder")} onChange={(e) => setPurpose(e.target.value)} autoFocus />
        <div className="row end">
          <button type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" className="primary" disabled={!ready}>{t("addScene.submit")}</button>
        </div>
      </form>
    </div>
  );
}
