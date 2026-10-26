// Отчёт проверки финала (Task 45, `verify.json` Task 44): формат против настроек, длительность,
// синхронность речи по ключевым словам (норма — не больше кадра), кадры против исходника и сцен
// (PSNR, смещение), громкость, каналы и теги цвета. Вердикт: пройдена — «Готово» и «Скачать»;
// `failed_verification` — красным, без «Готово», «Скачать всё равно» с подтверждением.
import type { FinalExportDto } from "@ms/contracts";
import { timelineUrls } from "../../api/timeline-client.js";
import { t, tk } from "../../i18n/index.js";

const r1 = (x: number) => (Math.round(x * 10) / 10).toFixed(1);

/** Ссылка на файл финала: при непройденной проверке — с подтверждением. */
export function FinalDownload({ exp }: { exp: Pick<FinalExportDto, "id" | "status"> }) {
  const failed = exp.status !== "ready";
  return (
    <a
      className="button"
      href={timelineUrls.finalFile(exp.id)}
      download
      data-testid="final-download"
      onClick={(e) => { if (failed && !window.confirm(t("finalExport.downloadConfirm"))) e.preventDefault(); }}
    >
      {failed ? t("finalExport.downloadAnyway") : t("finalExport.download")}
    </a>
  );
}

/** `words` — текст слова по id (иначе в строке синхронности — id слова). */
export function VerifyReport({ exp, words }: { exp: FinalExportDto; words?: ReadonlyMap<string, string> }) {
  const v = exp.verify;
  const failed = exp.status !== "ready" || v?.verdict === "fail";
  const frameUs = exp.output ? (1e6 * exp.output.fps.den) / exp.output.fps.num : (1e6 * (exp.request.fps?.den ?? 1)) / (exp.request.fps?.num ?? 30);
  return (
    <section className="verify-report stack" data-testid="verify-report" data-verdict={failed ? "fail" : "pass"} aria-label={t("finalExport.verify.title")}>
      <h4>{t("finalExport.verify.title")}</h4>
      {failed ? (
        <p className="verdict fail" role="alert">
          {t("finalExport.verify.failed", { list: (v?.failures ?? []).map((f) => tk(`finalExport.verify.check.${f}`, f)).join(", ") || "—" })}
        </p>
      ) : (
        <p className="verdict pass">{t("finalExport.verify.ready")}</p>
      )}
      <div className="row wrap"><FinalDownload exp={exp} /></div>
      {!v ? <p className="muted">{t("finalExport.verify.missing")}</p> : (
        <>
          <p className={v.probe.length > 0 ? "bad" : ""}>
            {t("finalExport.verify.probe")}: {v.probe.length > 0 ? v.probe.join("; ") : t("finalExport.verify.probeOk")}
          </p>
          <p className={v.failures.includes("duration") ? "bad" : ""}>
            {t("finalExport.verify.duration", { expected: v.duration.expected_frames, actual: r1(v.duration.actual_us / 1e6), delta: v.duration.delta_frames })}
          </p>
          <div>
            <strong>{t("finalExport.verify.sync")}</strong>
            {v.sync_check?.status === "unchecked" ? <p className="muted small">{t("finalExport.verify.syncUnchecked", { message: v.sync_check.message ?? "" })}</p> : null}
            {v.sync.length === 0 ? <p className="muted small">{t("finalExport.verify.syncNone")}</p> : (
              <ul className="small" data-testid="verify-sync">
                {v.sync.map((s) => {
                  const bad = Math.abs(s.offset_us) > frameUs;
                  return (
                    <li key={s.word_id} className={bad ? "bad" : ""}>
                      {t("finalExport.verify.syncRow", { word: words?.get(s.word_id) ?? s.word_id, ms: Math.round(s.offset_us / 1000) })} — {bad ? t("finalExport.verify.bad") : t("finalExport.verify.ok")}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <strong>{t("finalExport.verify.frames")}</strong>
            <ul className="small" data-testid="verify-frames">
              {v.frames.map((f, i) => (
                <li key={`${f.frame}-${i}`}>
                  {t("finalExport.verify.frameRow", {
                    frame: f.frame, kind: tk(`finalExport.verify.kind.${f.kind}`, f.kind), psnr: r1(f.psnr_db),
                    offset: f.offset === "inconclusive" ? t("finalExport.verify.inconclusive") : f.offset,
                  })}
                </li>
              ))}
            </ul>
            {v.frames_skipped && v.frames_skipped.length > 0 ? (
              <p className="muted small">{t("finalExport.verify.skipped", { list: v.frames_skipped.map((s) => `${s.frame} (${s.reason})`).join("; ") })}</p>
            ) : null}
          </div>
          <p className={v.failures.includes("loudness") ? "bad" : ""}>
            {t("finalExport.verify.loudness", { src: r1(v.loudness.source_lufs), fin: r1(v.loudness.final_lufs), delta: r1(v.loudness.delta_lu), peak: r1(v.loudness.final_peak_db) })}
          </p>
          {v.channels ? <p className={v.channels.ok ? "" : "bad"}>{t("finalExport.verify.channels", { message: v.channels.message })}</p> : null}
          {v.color_tags ? (
            <p className="muted small">{t("finalExport.verify.colorTags", { space: v.color_tags.color_space ?? "—", primaries: v.color_tags.color_primaries ?? "—", transfer: v.color_tags.color_transfer ?? "—" })}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
