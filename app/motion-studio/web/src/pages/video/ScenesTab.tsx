// Вкладка «Сцены» видеопроекта (Task 40): плитка на каждую принятую сцену текущей ревизии плана —
// превью версии или в контексте исходника, статус и очередь, QA, Approval C; «Сгенерировать все»
// (пакет: сцены без готовой версии по текущему плану, нужно валидное B), прогресс и «Отменить
// пакет» (`BatchBar` сценария), «Повторить» / «Перегенерировать» — generate { item_ids }
// (новые ключи `:try-n` / `:regen-k` ставит сервер); «Доработать» — Playground.
import type { VideoSceneDto } from "@ms/contracts";
import type { ReactElement } from "react";
import {
  useCancelVideoBatch, useVideoGenerate, useVideoScenes, videoAllKey, videoRetryKey, videoScenesErrorText,
} from "../../api/video-scenes-client.js";
import { BatchBar } from "../../components/script/BatchBar.js";
import "../../components/script/script.css";
import { VideoSceneTile } from "../../components/video-scenes/VideoSceneTile.js";
import { t } from "../../i18n/index.js";
import type { VideoTabProps } from "./tab-props.js";

export const ScenesTab: (props: VideoTabProps) => ReactElement = ({ data }) => {
  const projectId = data.project.id;
  const hasPlan = data.plan !== null;
  const q = useVideoScenes(projectId, hasPlan);
  const generate = useVideoGenerate(projectId);
  const cancel = useCancelVideoBatch(projectId);

  if (!hasPlan) return <section className="panel" data-tab="scenes"><p className="muted">{t("videoScenes.stub")}</p></section>;
  if (q.isError) return <section className="panel" data-tab="scenes"><p className="error">{videoScenesErrorText(q.error)}</p></section>;
  const s = q.data;
  if (!s) return <section className="panel" data-tab="scenes"><p className="muted">{t("common.loading")}</p></section>;
  if (!s.plan) return <section className="panel" data-tab="scenes"><p className="muted">{t("videoScenes.stub")}</p></section>;
  const revision = s.plan.revision;
  const bValid = s.approval_b.state === "valid";
  const numbers = new Map(s.scenes.map((x, i) => [x.item_id, i + 1]));
  const busy = generate.isPending;
  const latest = s.batches[0];
  const skipped = generate.data?.skipped ?? [];

  const regenerate = (x: VideoSceneDto) =>
    generate.mutate({ body: { revision, item_ids: [x.item_id], regenerate: true }, key: videoRetryKey("regen", x) });
  const retry = (x: VideoSceneDto) => {
    // упала перегенерация актуальной сцены: версия есть и не устарела — сервер счёл бы её готовой
    if (x.version_id && !x.stale) regenerate(x);
    else generate.mutate({ body: { revision, item_ids: [x.item_id] }, key: videoRetryKey("retry", x) });
  };

  return (
    <section className="panel script-scenes" data-tab="scenes">
      {!bValid ? (
        <p className="hint" role="status">{s.approval_b.state === "stale" ? t("videoScenes.needBStale") : t("videoScenes.needB")}</p>
      ) : null}
      <div className="row wrap">
        <button
          type="button"
          className="primary"
          disabled={!bValid || busy || s.scenes.length === 0}
          title={t("videoScenes.generateAllHint")}
          onClick={() => generate.mutate({ body: { revision }, key: videoAllKey(s) })}
        >
          {t("videoScenes.generateAll")}
        </button>
      </div>
      {latest ? <BatchBar projectId={projectId} batch={latest} cancel={cancel} cost={false} /> : null}
      {generate.isError ? <p className="error" role="alert">{videoScenesErrorText(generate.error)}</p> : null}
      {skipped.length > 0 ? (
        <p className="muted small" data-testid="skipped">
          {t("videoScenes.skipped", { list: skipped.map((x) => t("videoScenes.skippedItem", { n: numbers.get(x.item_id) ?? "?", reason: x.reason })).join("; ") })}
        </p>
      ) : null}
      {s.scenes.length === 0 ? <p className="hint">{t("videoScenes.empty.noScenes")}</p> : null}
      <ul className="scene-tiles">
        {s.scenes.map((x, i) => {
          const canRetry = x.status === "failed" || x.status === "cancelled";
          const canRegen = x.status === "ready";
          return (
            <VideoSceneTile
              key={x.item_id}
              projectId={projectId}
              scene={x}
              n={i + 1}
              busy={busy || !bValid}
              {...(canRetry ? { onRetry: () => retry(x) } : {})}
              {...(canRegen ? { onRegenerate: () => regenerate(x) } : {})}
            />
          );
        })}
      </ul>
    </section>
  );
};
