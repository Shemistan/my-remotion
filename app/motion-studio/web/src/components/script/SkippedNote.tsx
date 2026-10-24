// Сцены, которые сервер не поставил в пакет генерации (`ScriptBatchDto.skipped`), с причиной:
// «Сцена N — причина» (S9). Пусто — ничего.
import type { ScriptBatchDto } from "@ms/contracts";
import { t } from "../../i18n/index.js";

export function SkippedNote({ batch, numbers }: { batch: ScriptBatchDto | undefined; numbers: ReadonlyMap<string, number> }) {
  const skipped = batch?.skipped ?? [];
  if (skipped.length === 0) return null;
  return (
    <div className="notice warn small" role="status" data-testid="skipped">
      <strong>{t("scriptOutput.skipped")}</strong>
      <ul>
        {skipped.map((x, i) => {
          const n = numbers.get(x.item_id);
          return <li key={`${x.item_id}-${i}`}>{n !== undefined ? t("scriptOutput.scene.n", { n }) : t("scriptOutput.scene.removed")} — {x.reason}</li>;
        })}
      </ul>
    </div>
  );
}
