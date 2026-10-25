// Корзина (Task 47): удалённые проекты с размером и временем удаления; «Восстановить» — сразу
// (обратимо), «Удалить навсегда» и «Очистить корзину» — через второе подтверждение: сводка
// (`purge-intent`), флажок «понимаю, что нельзя отменить», затем задача `trash.purge`.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { newKey } from "../../api/client.js";
import { type TrashEntryDto, dateTime, projectsApi, useLifecycleInvalidate, useRestore } from "../../api/projects-client.js";
import { errorText, t } from "../../i18n/index.js";
import { sizeText } from "./DeleteDialog.js";

function PurgeDialog({ ids, onClose, onStarted }: { ids: string[]; onClose: () => void; onStarted: () => void }) {
  const uid = useId();
  const [ack, setAck] = useState(false);
  const [key] = useState(newKey);
  const intent = useQuery({ queryKey: ["purge-intent", ids.join(",")], queryFn: () => projectsApi.purgeIntent(ids), gcTime: 0, staleTime: 0, refetchOnWindowFocus: false });
  const purge = useMutation({ mutationFn: () => projectsApi.purge(ids, intent.data!.token, key), onSuccess: () => { onStarted(); onClose(); } });
  const i = intent.data;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`}>{t("purge.title")}</h2>
        {intent.isError ? <p className="error">{errorText(intent.error)}</p> : null}
        {i ? <p>{t("purge.summary", { count: i.count, files: i.files, size: sizeText(i.bytes) })}</p> : <p className="muted">{t("common.loading")}</p>}
        <label className="row">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {t("purge.ack")}
        </label>
        {purge.isError ? <p className="error">{errorText(purge.error)}</p> : null}
        <div className="row end">
          <button type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={!i || !ack || purge.isPending} onClick={() => purge.mutate()}>{t("purge.confirm")}</button>
        </div>
      </div>
    </div>
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
  if (!trash.data) return <p className="muted">{t("common.loading")}</p>;
  return (
    <div className="stack" data-testid="trash-list">
      {trash.data.length === 0 ? <p className="muted">{t("trash.empty")}</p> : null}
      {trash.data.length > 0 && items.length === 0 ? <p className="muted">{t("projects.noMatches")}</p> : null}
      <ul className="project-list">
        {items.map((e) => (
          <li key={e.id} data-trash-id={e.id}>
            <span className="strong">{e.title}</span>
            <span className="badge">{t(`project.kind.${e.kind}`)}</span>
            <span className="muted small">{t("trash.deletedAt", { at: dateTime(e.created_at) })} · {sizeText(e.bytes)}</span>
            <button type="button" disabled={restore.isPending} onClick={() => restore.mutate(e.id)}>{t("trash.restore")}</button>
            <button type="button" onClick={() => setDialog([e.id])}>{t("trash.purge")}</button>
          </li>
        ))}
      </ul>
      {restore.isError ? <p className="error">{errorText(restore.error)}</p> : null}
      {trash.data.length > 0 ? (
        <div className="row">
          <button type="button" onClick={() => setDialog(trash.data.map((e) => e.id))}>{t("trash.purgeAll")}</button>
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
