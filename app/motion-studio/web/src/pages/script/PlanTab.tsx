// Вкладка «План» сценария (S8, спека §8): слева текст с подсветкой сцен и выделением мышью
// («Добавить сцену по выделенному», «Границы по выделению»), скорость чтения; справа карточки
// сцен; ниже проблемы плана, пропуски, разнообразие, разбор, стиль проекта и «Утвердить и
// сгенерировать N сцен». Правки — операции плана (`usePlanOps`), генерация — `useGenerate`.
// Состояние — от ScriptWorkspace (`useScriptState`); вкладка его не запрашивает.
import { DEFAULT_READING, type PlanIssue, PlanIssueSchema, type ScriptPlanOp, type ScriptStateDto, type Technique, quoteOf } from "@ms/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../../api/client.js";
import { useProjectStyle } from "../../api/queries.js";
import { scriptStateKey, useGenerate, usePlanOps } from "../../api/script-client.js";
import { BuildPlan } from "../../components/script/BuildPlan.js";
import { DiversitySummary } from "../../components/script/DiversitySummary.js";
import { IssueText, PlanIssues } from "../../components/script/PlanIssues.js";
import { ReadingForm } from "../../components/script/ReadingForm.js";
import { SceneCard, TechniqueOptions } from "../../components/script/SceneCard.js";
import { ScriptText } from "../../components/script/ScriptText.js";
import { StyleBiblePanel } from "../../components/video/StyleBiblePanel.js";
import { t, tn } from "../../i18n/index.js";
import { loadReading } from "../../script/draft.js";
import { generateEstimate, scriptErrorText } from "../../script/format.js";
import { type BlockRange, selectionToWords } from "../../script/selection.js";

/** Проблемы из ответа 422 `blocking_issues` (`{ issues: PlanIssue[] }`), если сервер их прислал. */
function serverIssues(e: unknown): PlanIssue[] {
  if (!(e instanceof ApiError) || e.code !== "blocking_issues") return [];
  const raw = (e.body as { issues?: unknown } | null)?.issues;
  return Array.isArray(raw) ? raw.filter((x): x is PlanIssue => PlanIssueSchema.safeParse(x).success) : [];
}

function StyleSection({ state }: { state: ScriptStateDto }) {
  const client = useQueryClient();
  const projectId = state.project.id;
  const style = useProjectStyle(projectId, state.style !== null);
  if (!state.style) return <section className="panel"><p className="muted small">{t("scriptPlan.style.none")}</p></section>;
  if (!style.data) return <section className="panel"><p className="muted small">{t("common.loading")}</p></section>;
  return (
    <StyleBiblePanel
      projectId={projectId}
      style={style.data}
      bValid={state.approval.state === "valid"}
      onSaved={(dto) => {
        client.setQueryData(["style", projectId], dto);
        void client.invalidateQueries({ queryKey: scriptStateKey(projectId) });
      }}
    />
  );
}

export const PlanTab: (props: { state: ScriptStateDto; onGenerated: () => void }) => ReactElement = ({ state, onGenerated }) => {
  const projectId = state.project.id;
  const script = state.script;
  const plan = state.plan;
  const ops = usePlanOps(projectId);
  const generate = useGenerate(projectId);
  // выбранная сцена и откуда её выбрали: прокручивается только другая сторона (ревью M3)
  const [picked, setPicked] = useState<{ id: string; from: "text" | "card" } | null>(null);
  const selectedId = picked?.id ?? null;
  const [sel, setSel] = useState<BlockRange | "cross_block" | null>(null);
  const [addTechnique, setAddTechnique] = useState<Technique | "">("");
  const textPanel = useRef<HTMLElement>(null);

  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    plan?.doc.items.filter((x) => x.status === "accepted").forEach((x, i) => m.set(x.id, i + 1));
    return m;
  }, [plan]);

  useEffect(() => {
    if (!picked) return;
    const target = picked.from === "text" ? `[data-item="${picked.id}"]` : `[data-fragment-item="${picked.id}"]`;
    document.querySelector(target)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [picked]);

  // клик вне текста и вне кнопок, работающих с выделением, сбрасывает выделение (ревью M4)
  useEffect(() => {
    if (!sel) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el && (textPanel.current?.contains(el) || el.closest("[data-keep-selection]"))) return;
      setSel(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [sel]);

  if (!script) return <section className="panel"><p className="muted">{t("scriptPlan.plan.noScript")}</p></section>;
  if (!plan) {
    return (
      <section className="panel stack">
        <p className="muted">{t("scriptPlan.plan.empty")}</p>
        <BuildPlan state={state} reading={loadReading(projectId) ?? DEFAULT_READING} blockedReason={null} onDone={() => {}} />
      </section>
    );
  }

  const doc = plan.doc;
  // план по прежней ревизии текста: его id слов к текущему тексту не относятся (ревью I3) —
  // без подсветки и без операций с диапазоном слов
  const outdated = state.plan_outdated;
  const words = !outdated && sel && sel !== "cross_block" ? selectionToWords(script, sel.blockId, sel.start, sel.end) : null;
  // ключ генерации — от ревизии плана и стиля (как ключи сервера): переживает перемонтирование (ревью M9)
  const genKey = `script-generate:${plan.plan_id}@r${doc.revision}:${state.style ? `${state.style.style_id}@r${state.style.revision}` : "nostyle"}`;
  const pickFrom = (from: "text" | "card") => (id: string) => setPicked({ id, from });
  const clearSelection = () => {
    window.getSelection()?.removeAllRanges();
    setSel(null);
  };
  const apply = (op: ScriptPlanOp) => {
    ops.mutate({ base_revision: doc.revision, ops: [op] }, { onSuccess: () => { if (op.op === "add" || (op.op === "modify" && op.patch.start_word_id)) clearSelection(); } });
  };
  const blockTitle = (blockId: string) => {
    const i = script.blocks.findIndex((b) => b.id === blockId);
    return script.blocks[i]?.title || t("scriptPlan.block.untitled", { n: i + 1 });
  };

  const accepted = doc.items.filter((x) => x.status === "accepted");
  const blocking = doc.issues.filter((x) => x.severity === "blocking");
  const reasons = [
    ...(outdated ? [t("scriptPlan.generate.outdated")] : []),
    ...(state.style ? [] : [t("scriptPlan.generate.noStyle")]),
    ...(blocking.length > 0 ? [t("scriptPlan.generate.blocked", { n: blocking.length })] : []),
    ...(accepted.length === 0 ? [t("scriptPlan.generate.none")] : []),
  ];
  const est = generateEstimate(accepted.length);

  return (
    <div className="stack" data-testid="plan-tab">
      {outdated ? (
        <div className="banner-warn stack" role="status">
          <span>{t("scriptPlan.outdated")}</span>
          <BuildPlan state={state} reading={doc.reading} blockedReason={null} onDone={() => {}} />
        </div>
      ) : null}
      <div className="row wrap">
        <span className="badge">{t("scriptPlan.plan.revision", { n: doc.revision })}</span>
        {state.approval.state === "valid" ? <span className="badge approval-valid">{t("scriptPlan.approval.valid")}</span> : null}
        {state.approval.state === "stale" ? <span className="badge approval-stale">{t("scriptPlan.approval.stale")}</span> : null}
        {ops.isPending ? <span className="muted small">{t("scriptPlan.plan.saving")}</span> : null}
      </div>
      {doc.agent === "skipped" ? <p className="hint">{t("scriptPlan.plan.agentSkipped")}</p> : null}
      {ops.isError ? <p className="error" role="alert">{scriptErrorText(ops.error)}</p> : null}

      <div className="script-plan-grid">
        <section className="panel script-text-panel" aria-label={t("scriptPlan.plan.textTitle")} ref={textPanel}>
          <h2>{t("scriptPlan.plan.textTitle")}</h2>
          {outdated ? null : <p className="hint">{t("scriptPlan.plan.textHint")}</p>}
          {sel && !outdated ? (
            <div className="script-selection" data-testid="selection-bar">
              {sel === "cross_block" ? <p className="hint">{t("scriptPlan.selection.cross")}</p> : !words ? <p className="hint">{t("scriptPlan.selection.none")}</p> : (
                <>
                  <p className="small">{t("scriptPlan.selection.quote", { quote: quoteOf(script, words.start_word_id, words.end_word_id) })}</p>
                  <div className="row wrap">
                    <label className="small muted" htmlFor="script-add-technique">{t("scriptPlan.selection.technique")}</label>
                    <select id="script-add-technique" value={addTechnique} onChange={(e) => setAddTechnique(e.target.value as Technique | "")}>
                      <option value="">{t("scriptPlan.selection.auto")}</option>
                      <TechniqueOptions />
                    </select>
                  </div>
                  <div className="row wrap">
                    <button
                      type="button"
                      className="primary"
                      disabled={ops.isPending}
                      onClick={() => apply({ op: "add", start_word_id: words.start_word_id, end_word_id: words.end_word_id, ...(addTechnique ? { technique: addTechnique } : {}) })}
                    >
                      {t("scriptPlan.selection.add")}
                    </button>
                  </div>
                </>
              )}
              <div className="row"><button type="button" className="link-button small" onClick={clearSelection}>{t("scriptPlan.selection.clear")}</button></div>
            </div>
          ) : null}
          {outdated ? <ScriptText doc={script} /> : (
            <ScriptText doc={script} items={doc.items} skipped={doc.skipped} numbers={numbers} selectedId={selectedId} onSelectItem={pickFrom("text")} onSelection={setSel} />
          )}
        </section>

        <div className="stack">
          <section className="panel stack" aria-label={t("scriptPlan.reading.title")}>
            <h2>{t("scriptPlan.reading.title")}</h2>
            <ReadingForm value={doc.reading} busy={ops.isPending} onApply={(r) => apply({ op: "set_reading", reading: r })} />
          </section>
          <section className="panel stack" aria-label={t("scriptPlan.plan.scenes")}>
            <h2>{t("scriptPlan.plan.scenes")}</h2>
            {doc.items.length === 0 ? <p className="muted">{t("scriptPlan.plan.noScenes")}</p> : (
              <ul className="script-cards">
                {doc.items.map((x) => (
                  <SceneCard
                    key={x.id}
                    item={x}
                    n={numbers.get(x.id)}
                    numbers={numbers}
                    blockTitle={blockTitle(x.block_id)}
                    fps={doc.fps}
                    issues={doc.issues.filter((i) => i.item_id === x.id)}
                    selection={words}
                    selected={selectedId === x.id}
                    busy={ops.isPending}
                    onSelect={() => pickFrom("card")(x.id)}
                    onOp={apply}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <PlanIssues issues={doc.issues} numbers={numbers} onSelect={pickFrom("text")} />

      <section className="panel" data-testid="plan-skipped" aria-label={t("scriptPlan.skipped.title")}>
        <h2>{t("scriptPlan.skipped.title")}</h2>
        {doc.skipped.length === 0 ? <p className="muted small">{t("scriptPlan.skipped.none")}</p> : (
          <ul className="plan-skipped-list">
            {doc.skipped.map((x) => (
              <li key={`${x.start_word_id}-${x.end_word_id}`}>
                <span className="evidence-quote">«{x.quote}»</span> <span className="muted">— {x.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DiversitySummary doc={doc} />

      <details className="panel">
        <summary>{t("scriptPlan.analysis.title")}</summary>
        <h3 className="small">{t("scriptPlan.analysis.chapters")}</h3>
        {doc.analysis.chapters.length === 0 ? <p className="muted small">{t("scriptPlan.analysis.empty")}</p> : (
          <ul>{doc.analysis.chapters.map((c) => <li key={c.id}><strong>{c.title}</strong>{c.summary ? <span className="muted"> — {c.summary}</span> : null}</li>)}</ul>
        )}
        {doc.analysis.anchors.length > 0 ? (
          <>
            <h3 className="small">{t("scriptPlan.analysis.anchors")}</h3>
            <ul>{doc.analysis.anchors.map((a) => <li key={a.id}>«{a.quote}»</li>)}</ul>
          </>
        ) : null}
        <h3 className="small">{t("scriptPlan.analysis.numbers")}</h3>
        {doc.analysis.numbers.length === 0 ? <p className="muted small">{t("scriptPlan.analysis.empty")}</p> : (
          <ul>{doc.analysis.numbers.map((n, i) => <li key={i}><strong>{String(n.value)}{n.unit ? ` ${n.unit}` : ""}</strong> <span className="muted">«{n.quote}»</span></li>)}</ul>
        )}
      </details>

      <StyleSection state={state} />

      <section className="panel generate-bar sticky-actions">
        <div className="row wrap">
          <button
            type="button"
            className="primary"
            disabled={reasons.length > 0 || generate.isPending || ops.isPending}
            onClick={() => generate.mutate({ body: { revision: doc.revision }, key: genKey }, { onSuccess: onGenerated })}
          >
            {tn("scriptPlan.generate", accepted.length, { min: est.minutes, usd: est.usd })}
          </button>
        </div>
        {reasons.length > 0 ? reasons.map((r) => <p key={r} className="hint">{r}</p>) : <p className="hint">{t("scriptPlan.generate.hint")}</p>}
        {generate.isError ? (
          <div className="error" role="alert" data-testid="generate-error">
            <p>{scriptErrorText(generate.error)}</p>
            {serverIssues(generate.error).length > 0 ? (
              <ul className="plan-issues">
                {serverIssues(generate.error).map((x, i) => (
                  <li key={`${x.code}-${i}`}>
                    {x.item_id && numbers.has(x.item_id) ? <strong>{t("scriptPlan.scene.n", { n: numbers.get(x.item_id)! })}: </strong> : null}
                    <IssueText issue={x} numbers={numbers} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};
