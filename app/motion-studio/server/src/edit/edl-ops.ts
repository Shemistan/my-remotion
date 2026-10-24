// Ревизии EDL (Task 27): статусы вырезок, ручные вырезки по словам и по времени, удаление.
// Вырезка — диапазон source-времени, выровненный по кадрам `timeline_fps`; слова — её якорь.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EdlRevisionDocSchema, acceptedCuts, buildTimeline, snapUsToFrame,
  type EditDecision, type EditedTimeline, type EdlOp, type EdlRevisionDoc, type Fps, type TranscriptWord,
} from "@ms/contracts";
import { canonicalJson } from "@ms/contracts/canonical";
import { approvalState, cascadeStale } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { RoughcutConfig } from "../config.js";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as media from "../db/repos/media.js";
import * as plans from "../db/repos/plans.js";
import * as transcripts from "../db/repos/transcripts.js";
import { projectLockKey } from "../jobs/locks.js";
import { enqueue } from "../jobs/queue.js";
import { EditError, RevisionConflictError } from "./errors.js";
import type { EditDeps } from "./transcript-ops.js";

/** Файл документа ревизии EDL. */
export const EDL_FILE = "edl.json";

/** Умолчания `roughcut.keepBeforeWordUs` и `roughcut.pauseMinUs` (config.ts). */
const KEEP_BEFORE_WORD_US = 100_000;
const PAUSE_MIN_US = 800_000;

/** Параметры вырезки по словам (`add_cut`, агентские вырезки Task 28). */
export interface CutConfig {
  /** Сколько оставить перед следующим словом, когда вырезка забирает паузу после слов, µs. */
  keepBeforeWordUs?: number;
  /** Пауза после последнего слова не короче этой — не забирается (её режет детектор пауз), µs. */
  pauseMinUs?: number;
  /** Длительность исходника: вырезки обрезаются ею, слово за концом — `word_out_of_range`. */
  sourceDurationUs?: number;
}

export type EdlOpsOptions = CutConfig;

/** ½ кадра в µs: настолько граница вырезки сдвигается выравниванием `snapUsToFrame`. */
function halfFrameUs(fps: Fps): number {
  return (1e6 * fps.den) / fps.num / 2;
}

/**
 * Слова, лежащие внутри вырезки `[startUs, endUs)` с допуском ½ кадра (критерий якорей, см.
 * `reanchorDecisions`): `start_us ≥ startUs − ½ кадра`, `end_us ≤ endUs + ½ кадра`, `start_us < endUs`.
 */
export function wordsInside<W extends Pick<TranscriptWord, "id" | "start_us" | "end_us">>(startUs: number, endUs: number, words: W[], fps: Fps): W[] {
  const half = halfFrameUs(fps);
  return words.filter((x) => x.start_us >= startUs - half && x.end_us <= endUs + half && x.start_us < endUs);
}

/**
 * Якоря-слова решений после правки транскрипта. Вырезка определяется source-временем и при правке
 * текста не двигается (таймлайн тот же, Approval A не устаревает от исправления опечатки). Если
 * слово-якорь удалено правкой, якорь пересчитывается: первое и последнее слово текущей ревизии,
 * лежащие внутри вырезки с допуском ½ кадра (`snapUsToFrame` сдвигает границы вырезки внутрь
 * слова на столько же): `start_us ≥ source_start_us − ½ кадра`, `end_us ≤ source_end_us + ½ кадра`
 * и `start_us < source_end_us` (слово нулевой длины ровно на конце — уже за вырезкой). Таких нет —
 * якоря снимаются (вырезка по времени, как `add_cut_range`). Решение с живыми якорями
 * возвращается тем же объектом.
 */
export function reanchorDecisions(
  decisions: EditDecision[], words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[], fps: Fps,
): EditDecision[] {
  const ids = new Set(words.map((x) => x.id));
  return decisions.map((d) => {
    if (d.start_word_id === undefined || (ids.has(d.start_word_id) && ids.has(d.end_word_id!))) return d;
    const inside = wordsInside(d.source_start_us, d.source_end_us, words, fps);
    if (inside.length > 0) return { ...d, start_word_id: inside[0]!.id, end_word_id: inside[inside.length - 1]!.id };
    const bare = { ...d };
    delete bare.start_word_id;
    delete bare.end_word_id;
    return bare;
  });
}

/** Новый id решения пользователя, уникальный в документе: `usr_r<ревизия>_<k>`. */
function userDecisionId(revision: number, taken: Set<string>): string {
  let k = 1;
  while (taken.has(`usr_r${revision}_${k}`)) k++;
  const id = `usr_r${revision}_${k}`;
  taken.add(id);
  return id;
}

/** Вырезка по кадрам: границы `snapUsToFrame`, конец не дальше исходника; пустая — `empty_cut`. */
function snapCut(startUs: number, endUs: number, fps: Fps, durationUs: number | undefined): { start: number; end: number } {
  const max = durationUs ?? Number.MAX_SAFE_INTEGER;
  const start = Math.min(snapUsToFrame(startUs, fps), max);
  const end = endUs >= max ? max : Math.min(snapUsToFrame(endUs, fps), max);
  if (end <= start) throw new EditError("empty_cut", `вырезка ${startUs}–${endUs} µs пуста после выравнивания по кадрам`);
  return { start, end };
}

function wordIndex(words: Pick<TranscriptWord, "id">[], id: string): number {
  const i = words.findIndex((x) => x.id === id);
  if (i < 0) throw new EditError("unknown_word", `нет слова ${id}`);
  return i;
}

/**
 * Границы вырезки слов `[startId, endId]` (общая для `add_cut` и агентских вырезок Task 28):
 * начало — `first.start_us`; конец — `last.end_us`, если после него последнее слово транскрипта
 * или пауза до следующего слова `≥ pauseMinUs` (длинная пауза — зона детектора пауз и отдельного
 * решения человека), иначе `max(last.end_us, next.start_us − keepBeforeWordUs)`. Границы —
 * `snapUsToFrame` (ближайший кадр: соседнее слово задевается не больше чем на ½ кадра), конец не
 * дальше исходника. Ошибки: `unknown_word`, `order`, `word_out_of_range`, `empty_cut`.
 */
export function cutForWords(
  words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[], startId: string, endId: string, fps: Fps, cfg: CutConfig = {},
): Required<Pick<EditDecision, "source_start_us" | "source_end_us" | "start_word_id" | "end_word_id">> {
  const keepBefore = cfg.keepBeforeWordUs ?? KEEP_BEFORE_WORD_US;
  const pauseMin = cfg.pauseMinUs ?? PAUSE_MIN_US;
  const si = wordIndex(words, startId);
  const ei = wordIndex(words, endId);
  if (si > ei) throw new EditError("order", `слово ${startId} идёт после ${endId}`);
  const first = words[si]!;
  const last = words[ei]!;
  if (cfg.sourceDurationUs !== undefined && first.start_us >= cfg.sourceDurationUs) {
    throw new EditError("word_out_of_range", `слово ${first.id} начинается за концом исходника`);
  }
  const next = words[ei + 1];
  const rawEnd = next && next.start_us - last.end_us < pauseMin ? Math.max(last.end_us, next.start_us - keepBefore) : last.end_us;
  const { start, end } = snapCut(first.start_us, rawEnd, fps, cfg.sourceDurationUs);
  return { source_start_us: start, source_end_us: end, start_word_id: first.id, end_word_id: last.id };
}

/** Документ без полей ревизии — сравнение «правка что-то изменила» (и повторный `roughcut.propose`). */
export function edlContent(doc: EdlRevisionDoc): string {
  return canonicalJson({ ...doc, revision: 0, parent_revision: undefined, ops: undefined });
}

/**
 * Применяет операции к ревизии EDL: результат — `revision + 1` с `parent_revision` и `ops`.
 * `add_cut` по словам — `cutForWords`, `origin: "user"`, `accepted`, `manual`. `add_cut_range` —
 * то же по времени без якорей. `set_status` — accepted/rejected. `remove` — удаляет решение
 * пользователя, чужое (детектор, агент) — `rejected`. Решения с удалёнными правкой транскрипта
 * якорями пересчитываются (`reanchorDecisions`). Документ без изменений (решения канонически те
 * же) — `no_change`: холостая ревизия не создаётся и Approval A не устаревает.
 */
export function applyEdlOps(doc: EdlRevisionDoc, ops: EdlOp[], words: TranscriptWord[], fps: Fps, opts: EdlOpsOptions = {}): EdlRevisionDoc {
  if (ops.length === 0) throw new EditError("empty_ops", "правка без операций");
  const revision = doc.revision + 1;
  let decisions = reanchorDecisions(doc.decisions, words, fps);
  const taken = new Set(decisions.map((d) => d.id));
  const find = (id: string): number => {
    const i = decisions.findIndex((d) => d.id === id);
    if (i < 0) throw new EditError("unknown_decision", `нет решения ${id}`);
    return i;
  };
  const manual = (start: number, end: number, explanation: string, anchors: Pick<EditDecision, "start_word_id" | "end_word_id">): EditDecision => ({
    id: userDecisionId(revision, taken), reason: "manual", origin: "user", status: "accepted", ...anchors,
    source_start_us: start, source_end_us: end, confidence: 1, explanation,
  });
  for (const op of ops) {
    switch (op.op) {
      case "set_status": {
        const i = find(op.decision_id);
        decisions = decisions.map((d, k) => (k === i ? { ...d, status: op.status } : d));
        break;
      }
      case "remove": {
        const i = find(op.decision_id);
        decisions = decisions[i]!.origin === "user"
          ? decisions.filter((_, k) => k !== i)
          : decisions.map((d, k) => (k === i ? { ...d, status: "rejected" as const } : d));
        break;
      }
      case "add_cut": {
        const c = cutForWords(words, op.start_word_id, op.end_word_id, fps, opts);
        const quote = words.slice(wordIndex(words, c.start_word_id), wordIndex(words, c.end_word_id) + 1).map((x) => x.text).join(" ");
        decisions = [...decisions, manual(c.source_start_us, c.source_end_us, `вырезано вручную: «${quote}»`, { start_word_id: c.start_word_id, end_word_id: c.end_word_id })];
        break;
      }
      case "add_cut_range": {
        if (opts.sourceDurationUs !== undefined && op.source_start_us >= opts.sourceDurationUs) {
          throw new EditError("word_out_of_range", `начало вырезки ${op.source_start_us} µs за концом исходника`);
        }
        const { start, end } = snapCut(op.source_start_us, op.source_end_us, fps, opts.sourceDurationUs);
        decisions = [...decisions, manual(start, end, "вырезано вручную по времени", {})];
        break;
      }
    }
  }
  const next: EdlRevisionDoc = { ...doc, revision, parent_revision: doc.revision, decisions, ops: ops.map((o) => ({ ...o })) };
  if (edlContent(next) === edlContent(doc)) throw new EditError("no_change", "правка не меняет решения EDL — новая ревизия не создаётся");
  return next;
}

/** Документ ревизии EDL (по умолчанию текущей) из хранилища, проверенный схемой. */
export function currentEdl(db: Db, root: string, edlId: string, revision?: number): EdlRevisionDoc {
  const e = edls.get(db, edlId);
  const rev = revision ?? e?.current_revision ?? undefined;
  const row = e && rev !== undefined ? edls.revision(db, edlId, rev) : undefined;
  if (!row) throw new EditError("edl_not_found", `нет EDL ${edlId}${revision === undefined ? "" : ` r${revision}`}`);
  return EdlRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/** Слова текущей ревизии транскрипта (из индекса БД). */
function currentWords(db: Db, transcriptId: string): TranscriptWord[] {
  const t = transcripts.get(db, transcriptId);
  if (!t || t.current_revision === null) throw new EditError("transcript_not_found", `нет транскрипта ${transcriptId}`);
  return transcripts.words(db, transcriptId, t.current_revision)
    .map((x) => ({ id: x.word_id, text: x.text, start_us: x.start_us, end_us: x.end_us, timing: x.timing, confidence: null }));
}

/**
 * Регистрация опубликованной ревизии EDL — вызывать в `register` транзакции
 * `ArtifactStore.writeRevision` (правка пользователя и `roughcut.propose`, Task 28):
 * `edls.insertRevision` (решения, `timelines`/`timeline_clips`, `current_revision`), затем
 * `approvalState(…, "A", currentSubject)` (валидное A → `stale(subject_changed)`) и
 * `cascadeStale(…, "A")` безусловно (ревью Task 24, M7): новая ревизия EDL всегда меняет субъект
 * A, а B зависит от EDL, даже если A уже `stale`. `timeline` — `buildTimeline(acceptedCuts(doc))`.
 * Есть план проекта — в той же транзакции `enqueue("plan.recheck")` (Task 32).
 */
export function registerEdlRevision(
  db: Db, r: { projectId: string; doc: EdlRevisionDoc; relPath: string; sha256: string; timeline: EditedTimeline },
): void {
  edls.insertRevision(db, { doc: r.doc, rel_path: r.relPath, sha256: r.sha256, timeline: r.timeline });
  approvalState(db, r.projectId, "A", currentSubject(db, r.projectId, "A"));
  cascadeStale(db, r.projectId, "A");
  // план есть — перепроверить его на новом монтаже (Task 32, без LLM); ключ — ревизия EDL
  if (plans.byProject(db, r.projectId)?.current_revision != null) {
    enqueue(db, { type: "plan.recheck", projectId: r.projectId, input: { projectId: r.projectId }, idempotencyKey: `plan.recheck:${r.doc.edl_id}@r${r.doc.revision}` });
  }
}

/**
 * Синхронная правка EDL: `base_revision ≠ current` → `revision_conflict`, замок
 * `project:<p>:edl` у задачи → `resource_busy`, холостая правка → `no_change`. Одной транзакцией
 * публикации: файл ревизии и `registerEdlRevision`. Отказ approvals не трогает. Слова — текущей
 * ревизии транскрипта EDL.
 */
export async function saveEdlRevision(
  deps: EditDeps & { roughcut?: Pick<RoughcutConfig, "keepBeforeWordUs" | "pauseMinUs"> },
  edlId: string,
  body: { base_revision: number; ops: EdlOp[] },
): Promise<{ doc: EdlRevisionDoc; timeline: EditedTimeline }> {
  const { db, store } = deps;
  const e = edls.get(db, edlId);
  if (!e || e.current_revision === null) throw new EditError("edl_not_found", `нет EDL ${edlId}`);
  const conflict = (d: Db): RevisionConflictError | undefined => {
    const cur = edls.get(d, edlId)!.current_revision;
    return cur === body.base_revision ? undefined : new RevisionConflictError(`EDL ${edlId}`, body.base_revision, cur);
  };
  const early = conflict(db);
  if (early) throw early;
  const base = currentEdl(db, deps.root, edlId, body.base_revision);
  const asset = media.get(db, base.media_id);
  if (!asset) throw new EditError("media_not_found", `нет исходника ${base.media_id}`);
  const durationUs = asset.probe.duration_us;
  const doc = EdlRevisionDocSchema.parse(applyEdlOps(base, body.ops, currentWords(db, base.transcript_id), base.timeline_fps, {
    keepBeforeWordUs: deps.roughcut?.keepBeforeWordUs, pauseMinUs: deps.roughcut?.pauseMinUs, sourceDurationUs: durationUs,
  }));
  const timeline = buildTimeline(durationUs, acceptedCuts(doc), doc.timeline_fps);
  const destRel = artifactPaths(deps.root, e.project_id).edlRev(edlId, doc.revision);
  await store.writeRevision(destRel, EDL_FILE, doc, (d, files) => {
    registerEdlRevision(d, { projectId: e.project_id, doc, relPath: `${destRel}/${EDL_FILE}`, sha256: files[0]!.sha256, timeline });
  }, { lockKey: projectLockKey(e.project_id, "edl"), check: conflict });
  return { doc, timeline };
}
