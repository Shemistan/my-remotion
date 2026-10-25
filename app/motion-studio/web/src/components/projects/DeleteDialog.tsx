// Удаление проекта в корзину (Task 47): при открытии — сводка «что будет удалено» и токен
// (`delete-intent`); кнопка доступна, только когда введено точное название и у проекта нет
// незавершённых задач. Данные не стираются: проект уходит в корзину и восстанавливается.
// Устаревшее подтверждение (`intent_expired`) — сводка запрашивается заново.
import type { DeleteIntentDto } from "@ms/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ApiError } from "../../api/client.js";
import { projectsApi, sizeParts, useLifecycleInvalidate } from "../../api/projects-client.js";
import { errorText, t } from "../../i18n/index.js";

export interface DeleteDialogProps {
  id: string;
  title: string;
  onClose: () => void;
  onDeleted?: (trashId: string) => void;
}

/** Размер строкой словаря: «12 КБ». */
export function sizeText(bytes: number): string {
  const p = sizeParts(bytes);
  return t(`size.${p.unit}`, { v: p.value });
}

function Summary({ i }: { i: DeleteIntentDto }) {
  return (
    <>
      <p>{t("delete.summary")}</p>
      <ul data-testid="delete-summary">
        <li>{t("delete.scenes", { n: i.scenes ?? 0 })}</li>
        <li>{t("delete.versions", { n: i.versions ?? 0 })}</li>
        <li>{t("delete.exports", { n: i.exports ?? 0 })}</li>
        <li>{t("delete.packages", { n: i.packages ?? 0 })}</li>
        <li>{t("delete.files", { n: i.files, size: sizeText(i.bytes) })}</li>
      </ul>
    </>
  );
}

export function DeleteDialog({ id, title, onClose, onDeleted }: DeleteDialogProps) {
  const uid = useId();
  const [typed, setTyped] = useState("");
  const invalidate = useLifecycleInvalidate();
  const intent = useQuery({
    queryKey: ["delete-intent", id],
    queryFn: () => projectsApi.deleteIntent(id),
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const remove = useMutation({
    mutationFn: () => projectsApi.remove(id, intent.data!.token, typed),
    onSuccess: (r) => {
      invalidate();
      onDeleted?.(r.trash_id);
      onClose();
    },
    onError: (e) => {
      // подтверждение устарело (10 минут или проект изменился) — новая сводка
      if (e instanceof ApiError && e.code === "intent_expired") void intent.refetch();
    },
  });
  const i = intent.data;
  const busy = (i?.active_jobs ?? 0) > 0;
  const name = i?.title ?? title;
  const ok = i !== undefined && !busy && typed.trim() === name && !intent.isFetching;
  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <h2 id={`${uid}-title`}>{t("delete.title", { title: name })}</h2>
        {intent.isError ? <p className="error">{errorText(intent.error)}</p> : null}
        {!i && !intent.isError ? <p className="muted">{t("delete.loading")}</p> : null}
        {i ? <Summary i={i} /> : null}
        {busy ? <p className="error" role="alert">{t("delete.busy", { n: i!.active_jobs })}</p> : null}
        <p className="hint">{t("delete.trashNote")}</p>
        <label htmlFor={`${uid}-confirm`}>{t("delete.confirmLabel", { title: name })}</label>
        <input id={`${uid}-confirm`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        {remove.isError ? <p className="error">{errorText(remove.error)}</p> : null}
        <div className="row end">
          <button type="button" onClick={onClose}>{t("common.cancel")}</button>
          <button type="button" className="primary" disabled={!ok || remove.isPending} onClick={() => remove.mutate()}>{t("delete.confirm")}</button>
        </div>
      </div>
    </div>
  );
}
