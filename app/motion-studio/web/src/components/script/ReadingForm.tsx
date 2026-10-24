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
const show = (x: number) => String(x).replace(".", ",");
const toDraft = (r: ReadingSettings): Draft => ({ wps: show(r.wps), lead_s: show(r.lead_s), tail_s: show(r.tail_s) });

/** Число с запятой или точкой, до 0,01 (точность хранения скорости, §5.2). */
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  return /^\d+(\.\d*)?$|^\.\d+$/.test(t) ? Math.round(Number(t) * 100) / 100 : NaN;
};

function parse(d: Draft): ReadingSettings | null {
  const r = ReadingSettingsSchema.safeParse({ wps: num(d.wps), lead_s: num(d.lead_s), tail_s: num(d.tail_s) });
  return r.success ? r.data : null;
}

const equal = (a: ReadingSettings, b: ReadingSettings) => KEYS.every((k) => a[k] === b[k]);

export function ReadingForm({ value, onApply, busy }: ReadingFormProps) {
  const id = useId();
  const { wps, lead_s, tail_s } = value;
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  useEffect(() => setDraft(toDraft({ wps, lead_s, tail_s })), [wps, lead_s, tail_s]);
  const parsed = parse(draft);
  const changed = parsed !== null && !equal(parsed, value);
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
          <input id={`${id}-${k}`} type="text" inputMode="decimal" autoComplete="off" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
        </label>
      ))}
      <button type="submit" disabled={!changed || busy}>{t("scriptPlan.reading.apply")}</button>
      {parsed === null ? <p className="error small" role="alert">{t("scriptPlan.reading.invalid")}</p> : <p className="hint">{t("scriptPlan.reading.hint")}</p>}
    </form>
  );
}
