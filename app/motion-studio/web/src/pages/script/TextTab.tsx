// Вкладка «Текст» сценария (S8, спека §8): блоки (заголовок + текст, «Добавить блок»), счётчик
// слов и время чтения блока и всего текста, скорость и запас, «Сохранить» (новая ревизия),
// «Построить план» (по сохранённому тексту), текст с подсветкой фрагментов плана.
// Состояние — от ScriptWorkspace (`useScriptState`); вкладка его не запрашивает.
import { DEFAULT_READING, type ReadingSettings, type ScriptStateDto, tokenizeScript } from "@ms/contracts";
import { type ReactElement, useId, useMemo, useState } from "react";
import { usePlanOps, useSaveText } from "../../api/script-client.js";
import { BuildPlan } from "../../components/script/BuildPlan.js";
import { ReadingForm } from "../../components/script/ReadingForm.js";
import { ScriptText } from "../../components/script/ScriptText.js";
import { DisabledReason } from "../../components/ui/DisabledReason.js";
import { t } from "../../i18n/index.js";
import { type DraftBlock, type TextDraft, loadReading, loadTextDraft, saveReading, saveTextDraft } from "../../script/draft.js";
import { DEFAULT_FPS, readingSummary, scriptErrorText } from "../../script/format.js";
import { useUnsavedGuard } from "../../ui/unsaved.js";

const countWords = (text: string) => tokenizeScript([{ title: "", text }]).words.length;
const same = (a: DraftBlock[], b: DraftBlock[]) => JSON.stringify(a) === JSON.stringify(b);

export const TextTab: (props: { state: ScriptStateDto; onPlan: () => void }) => ReactElement = ({ state, onPlan }) => {
  const id = useId();
  const projectId = state.project.id;
  const saved = state.script;
  const savedBlocks = useMemo<DraftBlock[]>(
    () => (saved ? saved.blocks.map((b) => ({ title: b.title, text: b.text })) : [{ title: "", text: "" }]),
    [saved],
  );
  // черновик — только несохранённые правки; нет правок — показывается текст сервера (ревью I4)
  const [draft, setDraftState] = useState<TextDraft | null>(() => loadTextDraft(projectId));
  const setDraft = (d: TextDraft | null) => {
    setDraftState(d);
    saveTextDraft(projectId, d);
  };
  const blocks = draft?.blocks ?? savedBlocks;
  const dirty = draft !== null && !same(draft.blocks, savedBlocks);
  useUnsavedGuard(dirty);
  const serverRevision = saved?.revision ?? null;
  const conflict = dirty && draft.base !== serverRevision;
  const [localReading, setLocalReadingState] = useState<ReadingSettings>(() => loadReading(projectId) ?? DEFAULT_READING);
  const setLocalReading = (r: ReadingSettings) => {
    setLocalReadingState(r);
    saveReading(projectId, r);
  };
  const plan = state.plan;
  const reading = plan ? plan.doc.reading : localReading;
  const fps = plan?.doc.fps ?? state.project.settings?.fps ?? DEFAULT_FPS;

  const save = useSaveText(projectId);
  const ops = usePlanOps(projectId);
  const hasEmpty = blocks.some((b) => b.text.trim() === "");
  const counts = blocks.map((b) => countWords(b.text));
  const total = counts.reduce((a, b) => a + b, 0);
  const edit = (next: DraftBlock[]) => setDraft(same(next, savedBlocks) ? null : { base: draft?.base ?? serverRevision, blocks: next });
  const setBlock = (i: number, patch: Partial<DraftBlock>) => edit(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const doSave = (base: number | null) =>
    save.mutate({ ...(base !== null ? { base_revision: base } : {}), blocks }, { onSuccess: () => setDraft(null) });

  const numbers = useMemo(() => {
    const m = new Map<string, number>();
    plan?.doc.items.filter((x) => x.status === "accepted").forEach((x, i) => m.set(x.id, i + 1));
    return m;
  }, [plan]);

  return (
    <div className="stack" data-testid="text-tab">
      <section className="panel stack">
        <h2>{t("scriptPlan.text.title")}</h2>
        <p className="hint">{t("scriptPlan.text.intro")}</p>
        {!saved ? <p className="muted">{t("scriptPlan.text.empty")}</p> : null}
        {state.plan_outdated ? <div className="banner-warn" role="status">{t("scriptPlan.outdated")}</div> : null}
        <div className="script-blocks">
          {blocks.map((b, i) => (
            <div key={i} className="script-block-editor">
              <div className="row wrap">
                <label className="small muted" htmlFor={`${id}-title-${i}`}>{t("scriptPlan.block.title", { n: i + 1 })}</label>
                <span className="spacer" />
                <span className="small muted">{readingSummary(counts[i]!, reading, fps)}</span>
                {blocks.length > 1 ? (
                  <button type="button" className="link-button small" onClick={() => edit(blocks.filter((_, j) => j !== i))}>{t("scriptPlan.block.remove")}</button>
                ) : null}
              </div>
              <input id={`${id}-title-${i}`} type="text" value={b.title} onChange={(e) => setBlock(i, { title: e.target.value })} />
              <label className="small muted" htmlFor={`${id}-text-${i}`}>{t("scriptPlan.block.text", { n: i + 1 })}</label>
              <textarea id={`${id}-text-${i}`} value={b.text} onChange={(e) => setBlock(i, { text: e.target.value })} />
              {b.text.trim() === "" && (dirty || saved) ? <p className="hint">{t("scriptPlan.block.emptyHint")}</p> : null}
            </div>
          ))}
        </div>
        <div className="row wrap">
          <button type="button" onClick={() => edit([...blocks, { title: "", text: "" }])}>{t("scriptPlan.block.add")}</button>
          <span className="spacer" />
          <strong>{t("scriptPlan.text.total", { summary: readingSummary(total, reading, fps) })}</strong>
        </div>
        <div className="row wrap">
          <DisabledReason reasonKey={!dirty ? "ux.disabled.noChanges" : conflict ? "ux.disabled.resolveConflict" : hasEmpty ? "ux.disabled.completeBlocks" : save.isPending ? "ux.disabled.requestRunning" : null}>
            <button
              type="button"
              className="primary"
              disabled={!dirty || conflict || hasEmpty || save.isPending}
              onClick={() => doSave(draft?.base ?? serverRevision)}
            >
              {t("scriptPlan.text.save")}
            </button>
          </DisabledReason>
          {dirty ? <span className="muted small">{t("scriptPlan.text.unsaved")}</span> : saved ? <span className="ok small">{t("scriptPlan.text.saved", { n: saved.revision })}</span> : null}
        </div>
        {conflict ? (
          <div className="banner-warn stack" role="alert">
            <span>{t("scriptPlan.text.conflict", { n: serverRevision ?? 0 })}</span>
            <div className="row wrap">
              <button type="button" disabled={save.isPending || hasEmpty} onClick={() => doSave(serverRevision)}>{t("scriptPlan.text.keepMine")}</button>
              <button type="button" onClick={() => setDraft(null)}>{t("scriptPlan.text.takeServer")}</button>
            </div>
          </div>
        ) : null}
        {save.isError ? <p className="error" role="alert">{scriptErrorText(save.error)}</p> : null}
      </section>

      <section className="panel stack" aria-label={t("scriptPlan.reading.title")}>
        <h2>{t("scriptPlan.reading.title")}</h2>
        <ReadingForm
          value={reading}
          busy={ops.isPending}
          onApply={(r) => (plan ? ops.mutate({ base_revision: plan.doc.revision, ops: [{ op: "set_reading", reading: r }] }) : setLocalReading(r))}
        />
        {ops.isError ? <p className="error" role="alert">{scriptErrorText(ops.error)}</p> : null}
      </section>

      <section className="panel stack">
        <BuildPlan state={state} reading={reading} blockedReason={!saved || dirty ? t("scriptPlan.build.needSave") : null} onDone={onPlan} />
      </section>

      {saved && plan && !dirty ? (
        <section className="panel" aria-label={t("scriptPlan.text.preview")}>
          <h2>{t("scriptPlan.text.preview")}</h2>
          {/* план по прежней ревизии текста: его id слов к этому тексту не относятся (ревью I3) */}
          {state.plan_outdated ? <ScriptText doc={saved} /> : <ScriptText doc={saved} items={plan.doc.items} skipped={plan.doc.skipped} numbers={numbers} />}
        </section>
      ) : null}
    </div>
  );
};
