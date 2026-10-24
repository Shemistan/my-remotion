// Скорость чтения и запас сцены (S8, спека §5.2): черновик в полях, «Применить» — только при
// изменении и в границах схемы (wps 1–5, начало 0–3 с, конец 0–5 с). Запятая — как точка.
import { type ReadingSettings, ReadingSettingsSchema } from "@ms/contracts";
import { useEffect, useId, useState } from "react";
import { t } from "../../i18n/index.js";

export interface ReadingFormProps {
  value: ReadingSettings;
  onApply: (r: ReadingSettings) => void;
  busy?: boolean;
}

type Draft = Record<keyof ReadingSettings, string>;
const KEYS = ["wps", "lead_s", "tail_s"] as const;
const LABEL = { wps: "scriptPlan.reading.wps", lead_s: "scriptPlan.reading.lead", tail_s: "scriptPlan.reading.tail" } as const;
const STEP = { wps: "0.1", lead_s: "0.1", tail_s: "0.1" } as const;

const toDraft = (r: ReadingSettings): Draft => ({ wps: String(r.wps), lead_s: String(r.lead_s), tail_s: String(r.tail_s) });

function parse(d: Draft): ReadingSettings | null {
  const n = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));
  const r = ReadingSettingsSchema.safeParse({ wps: n(d.wps), lead_s: n(d.lead_s), tail_s: n(d.tail_s) });
  return r.success ? r.data : null;
}

export function ReadingForm({ value, onApply, busy }: ReadingFormProps) {
  const id = useId();
  const key = JSON.stringify(value);
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  useEffect(() => setDraft(toDraft(JSON.parse(key) as ReadingSettings)), [key]);
  const parsed = parse(draft);
  const changed = parsed !== null && JSON.stringify(parsed) !== key;
  return (
    <form
      className="reading-form"
      aria-label={t("scriptPlan.reading.title")}
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed && changed) onApply(parsed);
      }}
    >
      {KEYS.map((k) => (
        <label key={k} htmlFor={`${id}-${k}`}>
          {t(LABEL[k])}
          <input id={`${id}-${k}`} type="number" inputMode="decimal" step={STEP[k]} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        </label>
      ))}
      <button type="submit" disabled={!changed || busy}>{t("scriptPlan.reading.apply")}</button>
      {parsed === null ? <p className="error small" role="alert">{t("scriptPlan.reading.invalid")}</p> : <p className="hint">{t("scriptPlan.reading.hint")}</p>}
    </form>
  );
}
