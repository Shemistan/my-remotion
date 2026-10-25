// Правка транскрипта (Task 27): новая иммутабельная ревизия `r<N+1>` без потери таймкодов.
// Совпавшие слова сохраняют id и время ASR, вставленные получают id `<предыдущий>.<k>` и время,
// интерполированное в промежутке соседей, удалённые id уходят в `removed_word_ids` навсегда.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson } from "@ms/contracts/canonical";
import { TranscriptRevisionDocSchema, normalizeToken, type TranscriptOp, type TranscriptRevisionDoc, type TranscriptWord } from "@ms/contracts";
import { artifactPaths } from "../artifacts/paths.js";
import type { ArtifactStore } from "../artifacts/store.js";
import type { Db } from "../db/open.js";
import * as transcripts from "../db/repos/transcripts.js";
import { projectLockKey } from "../jobs/locks.js";
import { buildSegments } from "../media/segments.js";
import { alignTokenList, attachAfter, attachBefore, tokenizeEdit } from "./align.js";
import { EditError, RevisionConflictError } from "./errors.js";

/** Файл документа ревизии транскрипта (как у `asr.transcribe`). */
export const TRANSCRIPT_FILE = "transcript.json";

/** id «перед первым словом» для вставок в начало транскрипта (ASR нумерует с `w_000001`). */
const BEFORE_FIRST = "w_000000";

export interface EditDeps {
  db: Db;
  store: ArtifactStore;
  /** Корень хранилища (`store.root`). */
  root: string;
}

/** `[g0, g1]` поровну на `count` слов, целые µs. */
function spread(g0: number, g1: number, count: number): { start_us: number; end_us: number }[] {
  const len = Math.max(0, g1 - g0);
  return Array.from({ length: count }, (_, k) => ({ start_us: g0 + Math.round((len * k) / count), end_us: g0 + Math.round((len * (k + 1)) / count) }));
}

/**
 * Время вставок без замены: промежуток между словами `prev` и `next` (любого может не быть).
 * Слова перекрываются — нулевой длины в начале `next` (start_us не убывает).
 */
function interpolate(prev: TranscriptWord | undefined, next: TranscriptWord | undefined, count: number): { start_us: number; end_us: number }[] {
  if (prev && next) return spread(Math.min(prev.end_us, next.start_us), next.start_us, count);
  if (next) return spread(next.start_us, next.start_us, count); // в начало транскрипта: тишину до речи не занимаем
  if (prev) return spread(prev.end_us, prev.end_us, count); // в конец: нулевой длины
  return spread(0, 0, count);
}

function freeId(base: string, used: Set<string>): string {
  let k = 1;
  while (used.has(`${base}.${k}`)) k++;
  const id = `${base}.${k}`;
  used.add(id);
  return id;
}

function indexOf(words: TranscriptWord[], id: string): number {
  const i = words.findIndex((x) => x.id === id);
  if (i < 0) throw new EditError("unknown_word", `нет слова ${id}`);
  return i;
}

/**
 * Применяет операции к ревизии: результат — документ `revision + 1` (`parent_revision`,
 * `author: "user"`, `ops`), сегменты пересчитаны `buildSegments`. Операции — по очереди, каждая
 * видит результат предыдущих. `replace_text` — участок из одного слова. Пустой текст удаляет слова
 * участка; текст из одной пунктуации приклеивается к слову перед участком (в начале — после).
 * Замена N слов на M (N ≠ M): первые min(N, M) id сохраняются, время всех — поровну из диапазона
 * заменённых. Удалённые id не переиспользуются (`removed_word_ids` накапливается по ревизиям).
 * Слова после правки те же (id, тексты, время) — `no_change`: холостой ревизии нет.
 */
export function applyTranscriptOps(doc: TranscriptRevisionDoc, ops: TranscriptOp[]): TranscriptRevisionDoc {
  if (ops.length === 0) throw new EditError("empty_ops", "правка без операций");
  let words = doc.words;
  const removed = [...doc.removed_word_ids];
  const used = new Set<string>([...words.map((x) => x.id), ...removed]);
  for (const op of ops) {
    const [sid, eid] = op.op === "replace_text" ? [op.word_id, op.word_id] : [op.start_word_id, op.end_word_id];
    const si = indexOf(words, sid);
    const ei = indexOf(words, eid);
    if (si > ei) throw new EditError("order", `слово ${sid} идёт после ${eid}`);
    const span = words.slice(si, ei + 1);
    const byId = new Map(span.map((x) => [x.id, x]));
    // отдельные знаки ASR участка («–», «,») остаются словами со своим id и временем (S17c)
    const asrPunct = span.filter((x) => normalizeToken(x.text) === "").map((x) => x.text.trim());
    const { tokens, punctuation } = tokenizeEdit(op.text, asrPunct);
    const { steps, removed: gone } = alignTokenList(span, tokens);

    // слова участка по порядку; вставки — серии между оставшимися словами (или соседями участка)
    const out: TranscriptWord[] = [];
    let k = 0;
    while (k < steps.length) {
      const st = steps[k]!;
      if (st.kind === "kept") {
        const old = byId.get(st.word_id)!;
        out.push(old.text === st.text ? old : { ...old, text: st.text });
        k++;
        continue;
      }
      // серия до следующего оставшегося слова: заменённые (id сохраняется), удалённые, вставленные
      const run: { text: string; keep?: TranscriptWord }[] = [];
      const gone: TranscriptWord[] = []; // старые слова серии (заменённые и удалённые) — источник времени
      for (; k < steps.length && steps[k]!.kind !== "kept"; k++) {
        const s = steps[k]!;
        if (s.kind === "inserted") run.push({ text: s.text });
        else if (s.kind === "replaced") {
          const o = byId.get(s.word_id)!;
          gone.push(o);
          run.push({ text: s.text, keep: o });
        } else if (s.kind === "removed") gone.push(byId.get(s.word_id)!);
      }
      if (run.length === 0) continue;
      const prev = out.length > 0 ? out[out.length - 1] : words[si - 1];
      const nextKept = steps[k] as { kind: "kept"; word_id: string } | undefined;
      const next = nextKept ? byId.get(nextKept.word_id) : words[ei + 1];
      // id вставок — от последнего сохранённого слова серии, иначе от слова перед ней
      const base = run.filter((r) => r.keep).at(-1)?.keep!.id ?? prev?.id ?? BEFORE_FIRST;
      // замена: время старых слов серии (не паузы вокруг); конец — не позже начала следующего
      // слова, иначе у перекрытых слов ASR start_us вставок обогнал бы его
      const goneEnd = Math.max(...gone.map((x) => x.end_us));
      const times = gone.length > 0
        ? spread(gone[0]!.start_us, next ? Math.min(goneEnd, next.start_us) : goneEnd, run.length)
        : interpolate(prev, next, run.length);
      // слияние в одно слово: его границы — границы ASR первого и последнего старого слова
      const asrBounds = run.length === 1 && gone.every((x) => x.timing === "asr");
      run.forEach((r, x) => out.push(r.keep
        ? { ...r.keep, text: r.text, ...times[x]!, timing: asrBounds ? "asr" : "interpolated" }
        : { id: freeId(base, used), text: r.text, ...times[x]!, timing: "interpolated", confidence: null }));
    }
    removed.push(...gone);
    const before = words.slice(0, si);
    const after = words.slice(ei + 1);
    if (punctuation) {
      // текст правки — одна пунктуация: к слову перед участком, иначе — к слову после
      if (out.length > 0) throw new Error("edit: пунктуация без слов при оставшихся словах");
      const at = before.length > 0 ? before : after.length > 0 ? after : undefined;
      if (!at) throw new EditError("invalid_text", "в транскрипте не осталось слов, к которым отнести пунктуацию");
      const i = at === before ? before.length - 1 : 0;
      const wd = at[i]!;
      at[i] = { ...wd, text: at === before ? attachAfter(wd.text, punctuation) : attachBefore(punctuation, wd.text) };
    }
    words = [...before, ...out, ...after];
  }
  if (canonicalJson(words) === canonicalJson(doc.words)) {
    throw new EditError("no_change", "правка не меняет транскрипт — новая ревизия не создаётся");
  }
  return {
    ...doc,
    revision: doc.revision + 1,
    parent_revision: doc.revision,
    author: "user",
    words,
    segments: buildSegments(words),
    removed_word_ids: removed,
    ops: ops.map((o) => ({ ...o })),
  };
}

/** Документ ревизии транскрипта (по умолчанию текущей) из хранилища, проверенный схемой. */
export function currentTranscript(db: Db, root: string, transcriptId: string, revision?: number): TranscriptRevisionDoc {
  const t = transcripts.get(db, transcriptId);
  const rev = revision ?? t?.current_revision ?? undefined;
  const row = t && rev !== undefined ? transcripts.revision(db, transcriptId, rev) : undefined;
  if (!row) throw new EditError("transcript_not_found", `нет транскрипта ${transcriptId}${revision === undefined ? "" : ` r${revision}`}`);
  return TranscriptRevisionDocSchema.parse(JSON.parse(readFileSync(join(root, row.rel_path), "utf8")));
}

/**
 * Синхронная правка пользователя: `base_revision ≠ current` → `revision_conflict` (409); замок
 * `project:<p>:transcript` у задачи → `resource_busy` (409). Ревизия (файл read-only), строки
 * слов и сегментов и `current_revision` — одна транзакция публикации; ранние ревизии не меняются.
 * EDL не трогается: вырезки — по source-времени (якоря-слова пересчитывает следующая ревизия EDL).
 */
export async function saveTranscriptRevision(
  deps: EditDeps, transcriptId: string, body: { base_revision: number; ops: TranscriptOp[] },
): Promise<TranscriptRevisionDoc> {
  const { db, store } = deps;
  const t = transcripts.get(db, transcriptId);
  if (!t || t.current_revision === null) throw new EditError("transcript_not_found", `нет транскрипта ${transcriptId}`);
  const conflict = (d: Db): RevisionConflictError | undefined => {
    const cur = transcripts.get(d, transcriptId)!.current_revision;
    return cur === body.base_revision ? undefined : new RevisionConflictError(`транскрипт ${transcriptId}`, body.base_revision, cur);
  };
  const early = conflict(db);
  if (early) throw early;
  const next = TranscriptRevisionDocSchema.parse(applyTranscriptOps(currentTranscript(db, deps.root, transcriptId, body.base_revision), body.ops));
  const destRel = artifactPaths(deps.root, t.project_id).transcriptRev(transcriptId, next.revision);
  await store.writeRevision(destRel, TRANSCRIPT_FILE, next, (d, files) => {
    transcripts.insertRevision(d, { doc: next, rel_path: `${destRel}/${TRANSCRIPT_FILE}`, sha256: files[0]!.sha256 });
  }, { lockKey: projectLockKey(t.project_id, "transcript"), check: conflict });
  return next;
}
