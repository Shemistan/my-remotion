// Вкладка «Сцены» видеопроекта (Task 40): плитка на каждую принятую сцену текущей ревизии плана —
// превью версии или в контексте исходника, статус и очередь, QA, Approval C; «Сгенерировать все»
// (пакет: сцены без готовой версии по текущему плану, нужно валидное B), прогресс и «Отменить
// пакет» (`BatchBar` сценария), «Повторить» / «Перегенерировать» — generate { item_ids }
// (новые ключи `:try-n` / `:regen-k` ставит сервер); «Доработать» — Playground. S21: «Перегенерировать
// выбранные» (чекбоксы плиток) и «Перегенерировать устаревшие» — тот же generate, ключ `videoBatchKey`.
import type { VideoSceneDto, VideoSceneStatus } from "@ms/contracts";
import { type ReactElement, useState } from "react";
import {
  skipReasonText, useCancelVideoBatch, useImproveVideoScene, useVideoGenerate, useVideoScenes, videoAllKey, videoBatchKey, videoReadySkipped, videoRetryKey,
} from "../../api/video-scenes-client.js";
import { BatchBar } from "../../components/script/BatchBar.js";
import "../../components/script/script.css";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.js";
import { DisabledReason } from "../../components/ui/DisabledReason.js";
import { EmptyState } from "../../components/ui/EmptyState.js";
import { Skeleton } from "../../components/ui/Skeleton.js";
import { VideoSceneTile } from "../../components/video-scenes/VideoSceneTile.js";
import { VideoScenesError } from "../../components/video-scenes/VideoScenesError.js";
import { t } from "../../i18n/index.js";
import type { VideoTabProps } from "./tab-props.js";

/** Сцены с идущей задачей (или заблокированные): не выбираются для пакетной перегенерации. */
const IN_FLIGHT = new Set<VideoSceneStatus>(["pending", "running", "blocked"]);

export const ScenesTab: (props: VideoTabProps) => ReactElement = ({ data }) => {
  const projectId = data.project.id;
  const hasPlan = data.plan !== null;
  const q = useVideoScenes(projectId, hasPlan);
  const generate = useVideoGenerate(projectId);
  const improve = useImproveVideoScene(projectId);
  const cancel = useCancelVideoBatch(projectId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // ревью S21: пакет из 2+ сцен — инлайн-подтверждение (каждая сцена — платная генерация)
  const [confirm, setConfirm] = useState<{ text: string; run: () => void } | null>(null);

  if (!hasPlan) return <section className="panel" data-tab="scenes"><p className="muted">{t("videoScenes.stub")}</p></section>;
  if (q.isError) return <section className="panel" data-tab="scenes"><VideoScenesError error={q.error} /></section>;
  const s = q.data;
  if (!s) return <section className="panel" data-tab="scenes"><Skeleton lines={5} /></section>;
  if (!s.plan) return <section className="panel" data-tab="scenes"><p className="muted">{t("videoScenes.stub")}</p></section>;
  const revision = s.plan.revision;
  const bValid = s.approval_b.state === "valid";
  const numbers = new Map(s.scenes.map((x, i) => [x.item_id, i + 1]));
  const busy = generate.isPending || improve.isPending;
  const latest = s.batches[0];
  // готовые сцены вне полного пакета — по состоянию (переживает смену вкладки и перезагрузку)
  const skipped = latest ? videoReadySkipped(latest, s) : [];

  const regenerate = (x: VideoSceneDto) =>
    generate.mutate({ body: { revision, item_ids: [x.item_id], regenerate: true }, key: videoRetryKey("regen", x) });
  const retry = (x: VideoSceneDto) => {
    // упала перегенерация актуальной сцены: версия есть и не устарела — сервер счёл бы её готовой
    if (x.version_id && !x.stale) regenerate(x);
    else generate.mutate({ body: { revision, item_ids: [x.item_id] }, key: videoRetryKey("retry", x) });
  };
  // S21: пакетная перегенерация — выбранные (`regenerate: true`) и устаревшие (по отпечатку плана);
  // идущие сцены не выбираются и в пакет «устаревших» не входят
  const selectable = s.scenes.filter((x) => !IN_FLIGHT.has(x.status));
  const selected = selectable.filter((x) => picked.has(x.item_id)).map((x) => x.item_id);
  const staleIds = selectable.filter((x) => x.stale).map((x) => x.item_id);
  const regenSelected = () => generate.mutate(
    { body: { revision, item_ids: selected, regenerate: true }, key: videoBatchKey("regen-selected", s, selected, data.style) },
    { onSuccess: () => setPicked(new Set()) },
  );
  const regenStale = () => generate.mutate({ body: { revision, item_ids: staleIds }, key: videoBatchKey("stale", s, staleIds, data.style) });
  const generateAll = () => generate.mutate({ body: { revision }, key: videoAllKey(s, data.style) });
  // к генерации по «Сгенерировать все» — не идущие сцены без готовой версии по текущему плану
  const allN = selectable.filter((x) => x.status !== "ready" || x.stale).length;
  const ask = (n: number, text: string, run: () => void) => (n >= 2 ? setConfirm({ text, run }) : run());
  const pick = (id: string, on: boolean) => setPicked((p) => {
    const next = new Set(p);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  return (
    <section className="panel script-scenes" data-tab="scenes">
      {!bValid ? (
        <p className="hint" role="status">{s.approval_b.state === "stale" ? t("videoScenes.needBStale") : t("videoScenes.needB")}</p>
      ) : null}
      <div className="row wrap">
        <DisabledReason reasonKey={!bValid ? "ux.disabled.approvePlan" : s.scenes.length === 0 ? "ux.disabled.noScenes" : busy || confirm !== null ? "ux.disabled.requestRunning" : null}>
          <button
            type="button"
            className="primary"
            disabled={!bValid || busy || s.scenes.length === 0 || confirm !== null}
            title={t("videoScenes.generateAllHint")}
            onClick={() => ask(allN, t("videoScenes.confirmAllN", { n: allN }), generateAll)}
          >
            {t("videoScenes.generateAll")}
          </button>
        </DisabledReason>
        <DisabledReason reasonKey={!bValid ? "ux.disabled.approvePlan" : selected.length === 0 ? "ux.disabled.selectScenes" : busy || confirm !== null ? "ux.disabled.requestRunning" : null}>
          <button type="button" disabled={!bValid || busy || selected.length === 0 || confirm !== null} title={t("videoScenes.regenSelectedHint")}
            onClick={() => ask(selected.length, t("videoScenes.confirmN", { n: selected.length }), regenSelected)}>
            {t("videoScenes.regenSelected", { n: selected.length })}
          </button>
        </DisabledReason>
        {staleIds.length > 0 ? (
          <DisabledReason reasonKey={!bValid ? "ux.disabled.approvePlan" : busy || confirm !== null ? "ux.disabled.requestRunning" : null}>
            <button type="button" disabled={!bValid || busy || confirm !== null} title={t("videoScenes.regenStaleHint")}
              onClick={() => ask(staleIds.length, t("videoScenes.confirmN", { n: staleIds.length }), regenStale)}>
              {t("videoScenes.regenStale", { n: staleIds.length })}
            </button>
          </DisabledReason>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={t("videoScenes.confirmGo")}
        description={confirm?.text ?? ""}
        confirmLabel={t("videoScenes.confirmGo")}
        cancelLabel={t("videoScenes.confirmCancel")}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.run(); setConfirm(null); }}
      />
      {latest ? <BatchBar projectId={projectId} batch={latest} readySkipped={skipped.length} cancel={cancel} cost={false} /> : null}
      {generate.isError || improve.isError ? <VideoScenesError error={generate.error ?? improve.error} /> : null}
      {skipped.length > 0 ? (
        <p className="muted small" data-testid="skipped">
          {t("videoScenes.skipped", { list: skipped.map((x) => t("videoScenes.skippedItem", { n: numbers.get(x.item_id) ?? "?", reason: skipReasonText(x.reason) })).join("; ") })}
        </p>
      ) : null}
      {s.scenes.length === 0 ? <EmptyState title={t("videoScenes.empty.noScenes")} description={t("ux.videoScenes.empty.description")} /> : null}
      <ul className="scene-tiles">
        {s.scenes.map((x, i) => {
          const canRetry = x.status === "failed" || x.status === "cancelled";
          const canRegen = x.status === "ready";
          const canImprove = x.status === "ready" && x.qa_overall !== null && x.scene_id !== null && x.version_id !== null;
          return (
            <VideoSceneTile
              key={x.item_id}
              projectId={projectId}
              scene={x}
              n={i + 1}
              busy={busy || !bValid}
              {...(canRetry ? { onRetry: () => retry(x) } : {})}
              {...(canRegen ? { onRegenerate: () => regenerate(x) } : {})}
              {...(canImprove ? { onImprove: () => improve.mutate({ sceneId: x.scene_id!, versionId: x.version_id! }) } : {})}
              {...(!IN_FLIGHT.has(x.status) ? { selected: picked.has(x.item_id), onSelect: (on: boolean) => pick(x.item_id, on) } : {})}
            />
          );
        })}
      </ul>
    </section>
  );
};
