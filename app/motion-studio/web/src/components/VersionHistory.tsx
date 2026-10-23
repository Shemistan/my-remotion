// История версий сцены: v1…vN (новые сверху), статус (готова / с замечаниями / не удалась),
// родитель, «Открыть», «Восстановить» (новая версия-копия, история не теряется), «Сравнить»
// с открытой версией.
import type { HistoryEntry, Job } from "@ms/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, newKey } from "../api/client.js";
import { errorText, t } from "../i18n/index.js";

export interface VersionHistoryProps {
  sceneId: string;
  versions: HistoryEntry[];
  openId: string | undefined;
  currentId: string | null;
  onOpen: (versionId: string) => void;
  onCompare: (a: string, b: string) => void;
  onJob?: (job: Job) => void;
}

/** Статус строки истории: ready с visual warn — «с замечаниями». */
export function versionState(v: Pick<HistoryEntry, "status" | "qa">): "ready" | "warn" | "failed" {
  if (v.status === "failed") return "failed";
  return v.qa?.visual === "warn" ? "warn" : "ready";
}

export function VersionHistory({ sceneId, versions, openId, currentId, onOpen, onCompare, onJob }: VersionHistoryProps) {
  const client = useQueryClient();
  const restore = useMutation({
    mutationFn: (versionId: string) => api.restore(sceneId, versionId, newKey()),
    onSuccess: (r) => {
      void client.invalidateQueries({ queryKey: ["scene", sceneId] });
      onJob?.(r.job);
    },
  });
  const byId = new Map(versions.map((v) => [v.version_id, v]));
  const list = [...versions].sort((a, b) => b.number - a.number);

  return (
    <section className="panel history" aria-label={t("versions.title")}>
      <h2>{t("versions.title")}</h2>
      {list.length === 0 ? <p className="muted">{t("versions.empty")}</p> : null}
      <ul>
        {list.map((v) => {
          const state = versionState(v);
          const parent = v.parent_version_id ? byId.get(v.parent_version_id) : undefined;
          return (
            <li key={v.version_id} className={v.version_id === openId ? "open" : ""} data-version-id={v.version_id}>
              <div className="row wrap">
                <strong data-version="">{t("versions.label", { n: v.number })}</strong>
                <span className={`badge state-${state}`}>{t(`versions.status.${state}`)}</span>
                {v.version_id === currentId ? <span className="badge">{t("versions.current")}</span> : null}
                {parent ? <span className="muted small">{t("versions.parent", { n: parent.number })}</span> : null}
              </div>
              <p className="prompt small" title={v.prompt}>{v.prompt}</p>
              <div className="row">
                <button type="button" data-action="open" disabled={v.version_id === openId} onClick={() => onOpen(v.version_id)}>{t("versions.open")}</button>
                <button type="button" data-action="restore" disabled={state === "failed" || restore.isPending} onClick={() => restore.mutate(v.version_id)}>
                  {t("versions.restore")}
                </button>
                <button type="button" data-action="compare" disabled={!openId || v.version_id === openId} onClick={() => openId && onCompare(openId, v.version_id)}>
                  {t("versions.compare")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {restore.isError ? <p className="error">{errorText(restore.error)}</p> : null}
    </section>
  );
}
