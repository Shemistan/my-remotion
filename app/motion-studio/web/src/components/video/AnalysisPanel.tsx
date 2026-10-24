// Вкладка «Анализ» (Task 33): видеоряд — запуск `footage.analyze` (без агента — только детектор
// Apple Vision), режим, шоты (`ShotList`), рамки на кадре рисует `SafeZoneOverlay` поверх плеера;
// смысл — запуск `semantic.analyze` (только при утверждённом A), главы и якоря.
import { type TranscriptWord, type VideoProjectDto, semanticWithoutAgent } from "@ms/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api, newKey } from "../../api/client.js";
import { isActive, useFootage, useSemantic } from "../../api/queries.js";
import { errorText, t } from "../../i18n/index.js";
import { AnchorList } from "./AnchorList.js";
import { ChaptersPanel } from "./ChaptersPanel.js";
import { ShotList } from "./ShotList.js";

export interface AnalysisPanelProps {
  data: VideoProjectDto;
  words: readonly TranscriptWord[];
  currentUs: number;
  onSeek: (sourceUs: number) => void;
  onJob: () => void;
}

export function AnalysisPanel({ data, words, currentUs, onSeek, onJob }: AnalysisPanelProps) {
  const projectId = data.project.id;
  const [footageAgent, setFootageAgent] = useState(false);
  // смысловой анализ без агента даёт пустую разметку (UI-тесты) — по умолчанию агент включён (ревью I1)
  const [semanticAgent, setSemanticAgent] = useState(true);
  const [keys, setKeys] = useState({ footage: newKey(), semantic: newKey() });
  const footage = useFootage(data.footage?.id);
  const semantic = useSemantic(data.semantic?.id);
  const busy = (type: string) => data.jobs.some((j) => j.type === type && isActive(j.status));
  const runFootage = useMutation({
    mutationFn: () => api.analyzeFootage(projectId, footageAgent, keys.footage),
    onSuccess: onJob,
    onSettled: () => setKeys((k) => ({ ...k, footage: newKey() })),
  });
  const runSemantic = useMutation({
    mutationFn: () => api.analyzeSemantic(projectId, semanticAgent, keys.semantic),
    onSuccess: onJob,
    onSettled: () => setKeys((k) => ({ ...k, semantic: newKey() })),
  });
  const aValid = data.approvals.A.state === "valid";
  const mode = footage.data?.analysis.mode ?? data.footage?.mode;

  return (
    <>
      <section className="panel analysis-footage" aria-label={t("analysis.footage")}>
        <h2>{t("analysis.footage")}</h2>
        <div className="row wrap">
          <button type="button" className="primary" disabled={!data.media || runFootage.isPending || busy("footage.analyze")} onClick={() => runFootage.mutate()}>
            {t("analysis.runFootage")}
          </button>
          <label className="row small">
            <input type="checkbox" checked={footageAgent} onChange={(e) => setFootageAgent(e.target.checked)} />
            {t("analysis.useAgent")}
          </label>
          {mode ? <span className="muted small" data-testid="footage-mode">{t("analysis.modeLabel", { mode: t(mode === "vision+llm" ? "analysis.mode.vision_llm" : `analysis.mode.${mode}`) })}</span> : null}
        </div>
        {runFootage.isError ? <p className="error">{errorText(runFootage.error)}</p> : null}
        {mode === "llm_only" ? <p className="msg-warning">{t("analysis.llmOnly")}</p> : null}
        {!data.footage ? <p className="muted">{t("analysis.footageEmpty")}</p> : footage.data ? (
          <>
            <p className="hint">{t("analysis.overlayHint")}</p>
            <ShotList footageId={data.footage.id} shots={footage.data.analysis.shots} currentUs={currentUs} onSeek={onSeek} />
          </>
        ) : <p className="muted">{t("common.loading")}</p>}
      </section>
      <section className="panel analysis-semantic" aria-label={t("analysis.semantic")}>
        <h2>{t("analysis.semantic")}</h2>
        <div className="row wrap">
          <button type="button" className="primary" disabled={!aValid || runSemantic.isPending || busy("semantic.analyze")} onClick={() => runSemantic.mutate()}>
            {t("analysis.runSemantic")}
          </button>
          <label className="row small">
            <input type="checkbox" checked={semanticAgent} onChange={(e) => setSemanticAgent(e.target.checked)} />
            {t("analysis.useAgent")}
          </label>
        </div>
        {!aValid ? <p className="hint">{t("analysis.needA")}</p> : null}
        {runSemantic.isError ? <p className="error">{errorText(runSemantic.error)}</p> : null}
        {data.semantic && !data.semantic.fresh ? <p className="msg-warning">{t("analysis.semanticStale")}</p> : null}
        {!data.semantic ? <p className="muted">{t("analysis.semanticEmpty")}</p> : semantic.data ? (
          <>
            {semanticWithoutAgent(semantic.data.semantic) ? <p className="msg-warning" data-testid="semantic-skipped">{t("analysis.semanticSkipped")}</p> : null}
            <ChaptersPanel semantic={semantic.data.semantic} words={words} onSeek={onSeek} />
            <AnchorList semantic={semantic.data.semantic} words={words} onSeek={onSeek} />
          </>
        ) : <p className="muted">{t("common.loading")}</p>}
      </section>
    </>
  );
}
