import { TranscriptRevisionDocSchema, type TranscriptRevisionDoc } from "@ms/contracts";
import type { Db } from "../open.js";
import { advanceCurrent, nowIso } from "./util.js";

export interface TranscriptRow {
  id: string;
  project_id: string;
  media_id: string;
  current_revision: number | null;
  language: string;
  created_at: string;
}
export interface TranscriptRevisionRow {
  transcript_id: string;
  revision: number;
  parent_revision: number | null;
  rel_path: string;
  sha256: string;
  author: "asr" | "user";
  created_at: string;
}
export interface WordRow {
  idx: number;
  word_id: string;
  text: string;
  start_us: number;
  end_us: number;
  timing: "asr" | "interpolated";
}

export function create(db: Db, t: { id: string; project_id: string; media_id: string; language: string }): TranscriptRow {
  db.prepare("INSERT INTO transcripts (id, project_id, media_id, current_revision, language, created_at) VALUES (?, ?, ?, NULL, ?, ?)")
    .run(t.id, t.project_id, t.media_id, t.language, nowIso());
  return get(db, t.id)!;
}

export function get(db: Db, id: string): TranscriptRow | undefined {
  return db.prepare("SELECT * FROM transcripts WHERE id = ?").get(id) as TranscriptRow | undefined;
}

/** Последний созданный транскрипт проекта. */
export function byProject(db: Db, projectId: string): TranscriptRow | undefined {
  return db.prepare("SELECT * FROM transcripts WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(projectId) as TranscriptRow | undefined;
}

/**
 * Индекс опубликованной ревизии (вызывать в `register` публикации): строка ревизии, слова,
 * сегменты, `current_revision` (только вперёд). Повтор номера — ошибка PRIMARY KEY.
 */
export function insertRevision(db: Db, r: { doc: TranscriptRevisionDoc; rel_path: string; sha256: string }): void {
  const doc = TranscriptRevisionDocSchema.parse(r.doc);
  const id = doc.transcript_id;
  db.prepare(`INSERT INTO transcript_revisions (transcript_id, revision, parent_revision, rel_path, sha256, author, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, doc.revision, doc.parent_revision ?? null, r.rel_path, r.sha256, doc.author, nowIso());
  const w = db.prepare(`INSERT INTO transcript_words (transcript_id, revision, idx, word_id, text, start_us, end_us, timing)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const index = new Map<string, number>();
  doc.words.forEach((x, i) => {
    index.set(x.id, i);
    w.run(id, doc.revision, i, x.id, x.text, x.start_us, x.end_us, x.timing);
  });
  const sg = db.prepare(`INSERT INTO transcript_segments (transcript_id, revision, segment_id, first_idx, last_idx, start_us, end_us)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const s of doc.segments) {
    // схема ревизии гарантирует, что слова сегмента есть в words
    const idxs = s.word_ids.map((wid) => index.get(wid)!);
    sg.run(id, doc.revision, s.id, idxs.length ? Math.min(...idxs) : -1, idxs.length ? Math.max(...idxs) : -1, s.start_us, s.end_us);
  }
  advanceCurrent(db, "transcripts", id, doc.revision, "транскрипта");
}

export function revision(db: Db, id: string, rev: number): TranscriptRevisionRow | undefined {
  return db.prepare("SELECT * FROM transcript_revisions WHERE transcript_id = ? AND revision = ?").get(id, rev) as TranscriptRevisionRow | undefined;
}

export function words(db: Db, id: string, rev: number): WordRow[] {
  return db.prepare("SELECT idx, word_id, text, start_us, end_us, timing FROM transcript_words WHERE transcript_id = ? AND revision = ? ORDER BY idx")
    .all(id, rev) as WordRow[];
}
