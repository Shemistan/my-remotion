// Переключатель формата сценария 16:9 / 9:16 (S9): вкладки «Сцены» и «Экспорт».
import type { Aspect } from "@ms/contracts";
import { t } from "../../i18n/index.js";
import { ASPECTS } from "../../script/output.js";

export function AspectSwitch({ value, onChange, name }: { value: Aspect; onChange: (a: Aspect) => void; name: string }) {
  return (
    <fieldset className="aspect-switch row">
      <legend className="small muted">{t("scriptOutput.aspect")}</legend>
      {ASPECTS.map((a) => (
        <label key={a} className={`inline aspect-option${value === a ? " selected" : ""}`}>
          <input type="radio" name={name} value={a} checked={value === a} onChange={() => onChange(a)} />
          <span>{a}</span>
        </label>
      ))}
    </fieldset>
  );
}
