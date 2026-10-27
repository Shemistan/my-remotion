// Корзина (Task 47): удалённые проекты с размером и временем удаления; «Восстановить» — сразу
// (обратимо), «Удалить навсегда» и «Очистить корзину» — через второе подтверждение: сводка
// (`purge-intent`), флажок «понимаю, что нельзя отменить», затем задача `trash.purge`. Строку,
// которую очистка уже начала стирать (`purging`), восстановить нельзя.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { newKey } from "../../api/client.js";
import { type TrashEntryDto, dateTime, projectsApi, useLifecycleInvalidate, useRestore } from "../../api/projects-client.js";
import { errorText, t } from "../../i18n/index.js";
import { ConfirmDialog } from "../ui/ConfirmDialog.js";
import { DisabledReason } from "../ui/DisabledReason.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Skeleton } from "../ui/Skeleton.js";
import { sizeText } from "./DeleteDialog.js";

function PurgeDialog({ ids, onClose, onStarted }: { ids: string[]; onClose: () => void; onStarted: () => void }) {
  const [ack, setAck] = useState(false);
  const [key] = useState(newKey);
  const intent = useQuery({ queryKey: ["purge-intent", ids.join(",")], queryFn: () => projectsApi.purgeIntent(ids), gcTime: 0, staleTime: 0, refetchOnWindowFocus: false });
  const purge = useMutation({ mutationFn: () => projectsApi.purge(ids, intent.data!.token, key), onSuccess: () => { onStarted(); onClose(); } });
  const i = intent.data;
  return (
    <ConfirmDialog
      open
      title={t("purge.title")}
      description={i ? t("purge.summary", { count: i.count, files: i.files, size: sizeText(i.bytes) }) : <Skeleton lines={2} compact />}
      confirmLabel={t("purge.confirm")}
      busy={purge.isPending}
      confirmDisabled={!i || !ack}
      danger
      onCancel={onClose}
      onConfirm={() => purge.mutate()}
    >
        {intent.isError ? <p className="error">{errorText(intent.error)}</p> : null}
        <label className="row">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {t("purge.ack")}
        </label>
        {purge.isError ? <p className="error">{errorText(purge.error)}</p> : null}
    </ConfirmDialog>
  );
}

export function TrashList({ filter = "" }: { filter?: string }) {
  const [purging, setPurging] = useState(false);
  const [dialog, setDialog] = useState<string[] | null>(null);
  const invalidate = useLifecycleInvalidate();
  // после запуска очистки корзина перечитывается, пока задача не сотрёт каталоги
  const trash = useQuery({ queryKey: ["trash"], queryFn: projectsApi.trash, refetchInterval: purging ? 2000 : false });
  const restore = useRestore();
  const q = filter.trim().toLowerCase();
  const items = (trash.data ?? []).filter((e: TrashEntryDto) => !q || e.title.toLowerCase().includes(q));
  if (trash.isError) return <p className="error">{errorText(trash.error)}</p>;
  if (!trash.data) return <Skeleton lines={3} compact />;
  return (
    <div className="stack" data-testid="trash-list">
      {trash.data.length === 0 ? <EmptyState compact title={t("trash.empty")} /> : null}
      {trash.data.length > 0 && items.length === 0 ? <p className="muted">{t("projects.noMatches")}</p> : null}
      <ul className="project-list">
        {items.map((e) => (
          <li key={e.id} data-trash-id={e.id}>
            <span className="strong">{e.title}</span>
            <span className="badge">{t(`project.kind.${e.kind}`)}</span>
            <span className="muted small">{t("trash.deletedAt", { at: dateTime(e.created_at) })} · {sizeText(e.bytes)}</span>
            {e.purging ? <span className="badge">{t("trash.purging")}</span> : null}
            <DisabledReason reasonKey={e.purging ? "ux.disabled.purging" : restore.isPending ? "ux.disabled.requestRunning" : null}>
              <button type="button" disabled={restore.isPending || e.purging} onClick={() => restore.mutate(e.id)}>{t("trash.restore")}</button>
            </DisabledReason>
            {/* у очищаемой строки тоже: новый purge-intent дочищает застрявший `.purging` */}
            <button type="button" onClick={() => setDialog([e.id])}>{t("trash.purge")}</button>
          </li>
        ))}
      </ul>
      {restore.isError ? <p className="error">{errorText(restore.error)}</p> : null}
      {trash.data.length > 0 ? (
        <div className="row">
          {/* очищается вся корзина, а не только видимое под фильтром — так и написано на кнопке */}
          <button type="button" onClick={() => setDialog(trash.data.map((e) => e.id))}>
            {items.length < trash.data.length ? t("trash.purgeAllFiltered", { count: trash.data.length }) : t("trash.purgeAll")}
          </button>
        </div>
      ) : null}
      {purging ? <p className="hint">{t("purge.started")}</p> : null}
      {dialog ? (
        <PurgeDialog
          ids={dialog}
          onClose={() => setDialog(null)}
          onStarted={() => {
            setPurging(true);
            invalidate();
            setTimeout(() => setPurging(false), 60_000);
          }}
        />
      ) : null}
    </div>
  );
}
