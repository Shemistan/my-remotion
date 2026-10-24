// Ревизии EDL (Task 27): статусы вырезок, ручные вырезки по словам и по времени, удаление.
// Вырезка — диапазон source-времени, выровненный по кадрам `timeline_fps`; слова — её якорь.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EdlRevisionDocSchema, acceptedCuts, buildTimeline, snapUsToFrame,
  type EditDecision, type EditedTimeline, type EdlOp, type EdlRevisionDoc, type Fps, type TranscriptWord,
} from "@ms/contracts";
import { approvalState, cascadeStale } from "../approvals/engine.js";
import { currentSubject } from "../approvals/subjects.js";
import { artifactPaths } from "../artifacts/paths.js";
import type { RoughcutConfig } from "../config.js";
import type { Db } from "../db/open.js";
import * as edls from "../db/repos/edls.js";
import * as media from "../db/repos/media.js";
import * as transcripts from "../db/repos/transcripts.js";
import { projectLockKey } from "../jobs/locks.js";
import { EditError, RevisionConflictError } from "./errors.js";
import type { EditDeps } from "./transcript-ops.js";

/** Файл документа ревизии EDL. */
export const EDL_FILE = "edl.json";

/** Умолчание `roughcut.keepBeforeWordUs` (config.ts). */
const KEEP_BEFORE_WORD_US = 100_000;

export interface EdlOpsOptions {
  /** Сколько оставить перед следующим словом, когда вырезка по словам забирает паузу после них, µs. */
  keepBeforeWordUs?: number;
  /** Длительность исходника: вырезки обрезаются ею, слово за концом — `word_out_of_range`. */
  sourceDurationUs?: number;
}

/**
 * Якоря-слова решений после правки транскрипта. Вырезка определяется source-временем и при правке
 * текста не двигается (таймлайн тот же, Approval A не устаревает от исправления опечатки). Если
 * слово-якорь удалено правкой, якорь пересчитывается: первое и последнее слово текущей ревизии,
 * целиком лежащие внутри `[source_start_us, source_end_us]`; таких нет — якоря снимаются (вырезка
 * по времени, как `add_cut_range`). Решение с живыми якорями возвращается тем же объектом.
 */
export function reanchorDecisions(decisions: EditDecision[], words: Pick<TranscriptWord, "id" | "start_us" | "end_us">[]): EditDecision[] {
  const ids = new Set(words.map((x) => x.id));
  return decisions.map((d) => {
    if (d.start_word_id === undefined || (ids.has(d.start_word_id) && ids.has(d.end_word_id!))) return d;
    const inside = words.filter((x) => x.start_us >= d.source_start_us && x.end_us <= d.source_end_us);
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

/**
 * Применяет операции к ревизии EDL: результат — `revision + 1` с `parent_revision` и `ops`.
 * `add_cut` по словам — `[first.start_us, max(last.end_us, next.start_us − keepBeforeWordUs)]`
 * (у последнего слова транскрипта — `last.end_us`), границы — `snapUsToFrame` (ближайший кадр:
 * соседнее слово задевается не больше чем на ½ кадра), `origin: "user"`, `accepted`, `manual`.
 * `add_cut_range` — то же по времени без якорей. `set_status` — accepted/rejected. `remove` —
 * удаляет решение пользователя, чужое (детектор, агент) — `rejected`. Решения с удалёнными
 * правкой транскрипта якорями пересчитываются (`reanchorDecisions`).
 */
export function applyEdlOps(doc: EdlRevisionDoc, ops: EdlOp[], words: TranscriptWord[], fps: Fps, opts: EdlOpsOptions = {}): EdlRevisionDoc {
  if (ops.length === 0) throw new EditError("empty_ops", "правка без операций");
  const keepBefore = opts.keepBeforeWordUs ?? KEEP_BEFORE_WORD_US;
  const revision = doc.revision + 1;
  let decisions = reanchorDecisions(doc.decisions, words);
  const taken = new Set(decisions.map((d) => d.id));
  const find = (id: string): number => {
    const i = decisions.findIndex((d) => d.id === id);
    if (i < 0) throw new EditError("unknown_decision", `нет решения ${id}`);
    return i;
  };
  const wordIndex = (id: string): number => {
    const i = words.findIndex((x) => x.id === id);
    if (i < 0) throw new EditError("unknown_word", `нет слова ${id}`);
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
        const si = wordIndex(op.start_word_id);
        const ei = wordIndex(op.end_word_id);
        if (si > ei) throw new EditError("order", `слово ${op.start_word_id} идёт после ${op.end_word_id}`);
        const first = words[si]!;
        const last = words[ei]!;
        if (opts.sourceDurationUs !== undefined && first.start_us >= opts.sourceDurationUs) {
          throw new EditError("word_out_of_range", `слово ${first.id} начинается за концом исходника`);
        }
        const next = words[ei + 1];
        const rawEnd = next ? Math.max(last.end_us, next.start_us - keepBefore) : last.end_us;
        const { start, end } = snapCut(first.start_us, rawEnd, fps, opts.sourceDurationUs);
        const quote = words.slice(si, ei + 1).map((x) => x.text).join(" ");
        decisions = [...decisions, manual(start, end, `вырезано вручную: «${quote}»`, { start_word_id: first.id, end_word_id: last.id })];
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
  return { ...doc, revision, parent_revision: doc.revision, decisions, ops: ops.map((o) => ({ ...o })) };
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
 * Синхронная правка EDL: `base_revision ≠ current` → `revision_conflict`, замок
 * `project:<p>:edl` у задачи → `resource_busy`. Одной транзакцией публикации: файл ревизии,
 * `edl_revisions`, `edit_decisions`, `timelines`/`timeline_clips`, `current_revision`, устаревание
 * Approval A (`approvalState` → `stale(subject_changed)`) и каскад на B (`cascadeStale(…, "A")`,
 * ревью Task 24, M7). Слова — текущей ревизии транскрипта EDL.
 */
export async function saveEdlRevision(
  deps: EditDeps & { roughcut?: Pick<RoughcutConfig, "keepBeforeWordUs"> },
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
    keepBeforeWordUs: deps.roughcut?.keepBeforeWordUs, sourceDurationUs: durationUs,
  }));
  const timeline = buildTimeline(durationUs, acceptedCuts(doc), doc.timeline_fps);
  const destRel = artifactPaths(deps.root, e.project_id).edlRev(edlId, doc.revision);
  await store.writeRevision(destRel, EDL_FILE, doc, (d, files) => {
    edls.insertRevision(d, { doc, rel_path: `${destRel}/${EDL_FILE}`, sha256: files[0]!.sha256, timeline });
    approvalState(d, e.project_id, "A", currentSubject(d, e.project_id, "A"));
    cascadeStale(d, e.project_id, "A");
  }, { lockKey: projectLockKey(e.project_id, "edl"), check: conflict });
  return { doc, timeline };
}
