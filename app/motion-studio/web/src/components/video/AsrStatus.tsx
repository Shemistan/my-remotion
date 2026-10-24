// Распознавание речи: доступность ASR (без путей — причины кодами), язык и подсказки, запуск
// `asr.transcribe`.
import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { api, newKey } from "../../api/client.js";
import { useAsrCapability } from "../../api/queries.js";
import { errorText, t, tk } from "../../i18n/index.js";

export function AsrStatus({ mediaId, busy, onJob }: { mediaId: string; busy: boolean; onJob: (jobId: string) => void }) {
  const id = useId();
  const cap = useAsrCapability();
  const [language, setLanguage] = useState("ru");
  const [hotwords, setHotwords] = useState("");
  const [key] = useState(newKey);
  const run = useMutation({
    mutationFn: () => {
      const list = hotwords.split(",").map((s) => s.trim()).filter(Boolean);
      return api.transcribe(mediaId, { language, ...(list.length ? { hotwords: list } : {}) }, `${key}-${language}-${list.join("|")}`);
    },
    onSuccess: (r) => onJob(r.job.id),
  });
  const c = cap.data;
  return (
    <section className="panel asr-status">
      <h2>{t("asr.transcribe")}</h2>
      {c ? (
        c.available
          ? <p className="ok small">{t("asr.available", { model: c.model })}</p>
          : <p className="error small">{t("asr.unavailable", { reason: tk(`asr.reason.${c.reason}`, c.reason ?? "") })} {t("asr.doctorHint")}</p>
      ) : null}
      {c?.gpu_contention ? <p className="notice warn small">{t("asr.gpuContention")}</p> : null}
      <div className="form-row">
        <label htmlFor={`${id}-lang`}>{t("asr.language")}</label>
        <input id={`${id}-lang`} className="mono" value={language} maxLength={3} onChange={(e) => setLanguage(e.target.value.trim().toLowerCase())} />
      </div>
      <div className="form-row">
        <label htmlFor={`${id}-hw`}>{t("asr.hotwords")}</label>
        <input id={`${id}-hw`} value={hotwords} onChange={(e) => setHotwords(e.target.value)} />
      </div>
      {run.isError ? <p className="error">{errorText(run.error)}</p> : null}
      <button type="button" className="primary" disabled={busy || run.isPending || !/^[a-z]{2,3}$/.test(language)} onClick={() => run.mutate()}>
        {t("asr.transcribe")}
      </button>
    </section>
  );
}
