// Вкладка «Сцены» сценария (S9, спека §8): плитки принятых сцен плана в порядке текста — номер,
// цитата, приём, статус генерации, превью, предупреждения; прогресс и отмена пакета;
// переключатель 16:9 / 9:16 при вертикальных двойниках. «Повторить» — generate { item_ids }
// (9:16 — reframe), «Перегенерировать» — generate { regenerate: true }; «Доработать» — Playground.
// Состояние — от ScriptWorkspace (`useScriptState`); вкладка его не запрашивает.
import type { Aspect, ScriptStateDto } from "@ms/contracts";
import { type ReactElement, useMemo, useState } from "react";
import { useGenerate, useReframe } from "../../api/script-client.js";
import { AspectSwitch } from "../../components/script/AspectSwitch.js";
import { BatchBar } from "../../components/script/BatchBar.js";
import { SceneTile } from "../../components/script/SceneTile.js";
import { SkippedNote } from "../../components/script/SkippedNote.js";
import "../../components/script/script.css";
import { t } from "../../i18n/index.js";
import { scriptErrorText } from "../../script/format.js";
import { type SceneRow, itemNumbers, readySkipped, retryKey, sceneRows, visibleBatches } from "../../script/output.js";

export const ScenesTab: (props: { state: ScriptStateDto }) => ReactElement = ({ state }) => {
  const projectId = state.project.id;
  const plan = state.plan;
  const generate = useGenerate(projectId);
  const reframe = useReframe(projectId);
  const hasVertical = state.scenes.some((s) => s.aspect === "9:16");
  const [picked, setPicked] = useState<Aspect>("16:9");
  const aspect: Aspect = hasVertical ? picked : "16:9";
  const rows = useMemo(() => sceneRows(state, aspect), [state, aspect]);
  const numbers = useMemo(() => itemNumbers(state), [state]);
  const batches = visibleBatches(state.batches, aspect);
  const busy = generate.isPending || reframe.isPending;

  if (!plan) return <p className="muted">{t("scriptOutput.empty.noPlan")}</p>;
  const nothing = state.scenes.length === 0 && state.batches.length === 0;

  const regenerate = (row: SceneRow) =>
    generate.mutate({ body: { revision: plan.doc.revision, item_ids: [row.item.id], regenerate: true }, key: retryKey("regen", row, aspect) });
  const retry = (row: SceneRow) => {
    if (aspect === "9:16") {
      reframe.mutate({ body: { aspect: "9:16", item_ids: [row.item.id] }, key: retryKey("retry", row, aspect) });
      return;
    }
    // упала перегенерация актуальной сцены: версия есть и не устарела — сервер счёл бы сцену
    // готовой, повтор — только как перегенерация
    if (row.scene?.version_id && !row.scene.stale) regenerate(row);
    else generate.mutate({ body: { revision: plan.doc.revision, item_ids: [row.item.id] }, key: retryKey("retry", row, aspect) });
  };

  const error = generate.error ?? reframe.error;
  return (
    <div className="script-scenes">
      <div className="row wrap">
        {hasVertical ? <AspectSwitch value={aspect} onChange={setPicked} name="scenes-aspect" /> : null}
      </div>
      {batches.map((b) => <BatchBar key={b.id} projectId={projectId} batch={b} readySkipped={readySkipped(b, state)} />)}
      {error ? <p className="error" role="alert">{scriptErrorText(error)}</p> : null}
      <SkippedNote batch={generate.data} numbers={numbers} />
      <SkippedNote batch={reframe.data} numbers={numbers} />
      {nothing ? <p className="hint">{t("scriptOutput.empty.noScenes")}</p> : null}
      <ul className="scene-tiles">
        {rows.map((row) => {
          const st = row.scene?.status ?? "none";
          const canRetry = st === "failed" || st === "cancelled";
          // 9:16 перегенерируется заново через reframe — отдельной перегенерации у двойника нет
          const canRegen = aspect === "16:9" && st === "ready";
          return (
            <SceneTile
              key={row.item.id}
              row={row}
              numbers={numbers}
              busy={busy}
              {...(canRetry ? { onRetry: () => retry(row) } : {})}
              {...(canRegen ? { onRegenerate: () => regenerate(row) } : {})}
            />
          );
        })}
      </ul>
    </div>
  );
};
