-- Phase 2–3 (Task 24, `05` §1–3, §7): видеопроект. Документы ревизий лежат в каталогах
-- артефактов (`chmod -R a-w`), здесь — индекс и указатели `current_revision`.
-- Время — целые микросекунды (*_us); ISO 8601 UTC с миллисекундами (TEXT).

-- 1. jobs.type: типы задач Phase 2–3. CHECK в SQLite не меняется — таблица пересобирается
--    (внешние ключи на время миграции выключает migrate(), целостность — foreign_key_check).
CREATE TABLE jobs_new (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('playground.generate', 'playground.edit', 'scene.restore', 'scene.export',
                                                 'media.import', 'asr.transcribe', 'roughcut.propose', 'roughcut.preview',
                                                 'footage.analyze', 'semantic.analyze', 'plan.visual', 'plan.recheck')),
  project_id       TEXT NOT NULL REFERENCES projects (id),
  scene_id         TEXT REFERENCES scenes (id),
  version_id       TEXT REFERENCES scene_versions (id),
  parent_job_id    TEXT REFERENCES jobs (id),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled',
                                                   'awaiting_approval', 'awaiting_input', 'blocked')),
  progress         REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 1),
  stage            TEXT,
  attempt          INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  max_attempts     INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  interrupts       INTEGER NOT NULL DEFAULT 0 CHECK (interrupts >= 0),
  input_refs_json  TEXT NOT NULL,
  input_hash       TEXT,
  output_refs_json TEXT,
  error_json       TEXT,
  idempotency_key  TEXT UNIQUE,
  lease_owner      TEXT,
  lease_until      TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0, 1)),
  created_at       TEXT NOT NULL,
  started_at       TEXT,
  finished_at      TEXT
) STRICT;
INSERT INTO jobs_new (id, type, project_id, scene_id, version_id, parent_job_id, status, progress, stage, attempt,
                      max_attempts, interrupts, input_refs_json, input_hash, output_refs_json, error_json,
                      idempotency_key, lease_owner, lease_until, cancel_requested, created_at, started_at, finished_at)
SELECT id, type, project_id, scene_id, version_id, parent_job_id, status, progress, stage, attempt,
       max_attempts, interrupts, input_refs_json, input_hash, output_refs_json, error_json,
       idempotency_key, lease_owner, lease_until, cancel_requested, created_at, started_at, finished_at
FROM jobs ORDER BY rowid;
DROP TABLE jobs;
ALTER TABLE jobs_new RENAME TO jobs;
CREATE INDEX jobs_status ON jobs (status, created_at);
CREATE INDEX jobs_scene ON jobs (scene_id, created_at);
CREATE INDEX jobs_project ON jobs (project_id, created_at);

-- 2. Исходник и производные. Один исходник на проект (ТЗ §1.2).
CREATE TABLE media_assets (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects (id),
  original_name     TEXT NOT NULL,
  rel_path          TEXT NOT NULL,
  sha256            TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL CHECK (size_bytes >= 0),
  probe_json        TEXT NOT NULL,
  import_json       TEXT NOT NULL,
  timeline_fps_num  INTEGER NOT NULL CHECK (timeline_fps_num > 0),
  timeline_fps_den  INTEGER NOT NULL CHECK (timeline_fps_den > 0),
  vfr               INTEGER NOT NULL CHECK (vfr IN (0, 1)),
  rotation          INTEGER NOT NULL CHECK (rotation IN (0, 90, 180, 270)),
  duration_us       INTEGER NOT NULL CHECK (duration_us >= 0),
  has_audio         INTEGER NOT NULL CHECK (has_audio IN (0, 1)),
  status            TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  created_by_job_id TEXT REFERENCES jobs (id),
  created_at        TEXT NOT NULL,
  UNIQUE (project_id)
) STRICT;
CREATE INDEX media_assets_sha ON media_assets (sha256);

CREATE TABLE media_derivatives (
  media_id    TEXT NOT NULL REFERENCES media_assets (id),
  kind        TEXT NOT NULL CHECK (kind IN ('proxy', 'waveform', 'thumbs', 'audio16k')),
  rel_path    TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  params_json TEXT NOT NULL,
  PRIMARY KEY (media_id, kind)
) STRICT;

-- 3. Транскрипт: ревизии r<N>; слова и сегменты ревизии — индекс для поиска и якорей.
CREATE TABLE transcripts (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id),
  media_id         TEXT NOT NULL REFERENCES media_assets (id),
  current_revision INTEGER CHECK (current_revision >= 1),
  language         TEXT NOT NULL,
  created_at       TEXT NOT NULL
) STRICT;
CREATE INDEX transcripts_project ON transcripts (project_id, created_at);

CREATE TABLE transcript_revisions (
  transcript_id   TEXT NOT NULL REFERENCES transcripts (id),
  revision        INTEGER NOT NULL CHECK (revision >= 1),
  parent_revision INTEGER,
  rel_path        TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  author          TEXT NOT NULL CHECK (author IN ('asr', 'user')),
  created_at      TEXT NOT NULL,
  PRIMARY KEY (transcript_id, revision)
) STRICT;

CREATE TABLE transcript_words (
  transcript_id TEXT NOT NULL,
  revision      INTEGER NOT NULL,
  idx           INTEGER NOT NULL CHECK (idx >= 0),
  word_id       TEXT NOT NULL,
  text          TEXT NOT NULL,
  start_us      INTEGER NOT NULL CHECK (start_us >= 0),
  end_us        INTEGER NOT NULL CHECK (end_us >= start_us),
  timing        TEXT NOT NULL CHECK (timing IN ('asr', 'interpolated')),
  PRIMARY KEY (transcript_id, revision, idx),
  UNIQUE (transcript_id, revision, word_id),
  FOREIGN KEY (transcript_id, revision) REFERENCES transcript_revisions (transcript_id, revision)
) STRICT;

CREATE TABLE transcript_segments (
  transcript_id TEXT NOT NULL,
  revision      INTEGER NOT NULL,
  segment_id    TEXT NOT NULL,
  first_idx     INTEGER NOT NULL,
  last_idx      INTEGER NOT NULL,
  start_us      INTEGER NOT NULL,
  end_us        INTEGER NOT NULL,
  PRIMARY KEY (transcript_id, revision, segment_id),
  FOREIGN KEY (transcript_id, revision) REFERENCES transcript_revisions (transcript_id, revision)
) STRICT;

-- 4. EDL (субъект Approval A), решения ревизии и таймлайн после неё.
CREATE TABLE edls (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id),
  media_id         TEXT NOT NULL REFERENCES media_assets (id),
  transcript_id    TEXT NOT NULL REFERENCES transcripts (id),
  current_revision INTEGER CHECK (current_revision >= 1),
  created_at       TEXT NOT NULL
) STRICT;
CREATE INDEX edls_project ON edls (project_id, created_at);

CREATE TABLE edl_revisions (
  edl_id          TEXT NOT NULL REFERENCES edls (id),
  revision        INTEGER NOT NULL CHECK (revision >= 1),
  parent_revision INTEGER,
  rel_path        TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  -- canonicalHash(документ ревизии) — subject_hash Approval A
  hash            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (edl_id, revision)
) STRICT;

CREATE TABLE edit_decisions (
  edl_id          TEXT NOT NULL,
  revision        INTEGER NOT NULL,
  decision_id     TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('pause', 'filler', 'repeat', 'false_start', 'bad_take', 'manual')),
  origin          TEXT NOT NULL CHECK (origin IN ('detector', 'agent', 'user')),
  status          TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected')),
  start_word_id   TEXT,
  end_word_id     TEXT,
  source_start_us INTEGER NOT NULL,
  source_end_us   INTEGER NOT NULL CHECK (source_end_us > source_start_us),
  confidence      REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  PRIMARY KEY (edl_id, revision, decision_id),
  FOREIGN KEY (edl_id, revision) REFERENCES edl_revisions (edl_id, revision)
) STRICT;

CREATE TABLE timelines (
  edl_id             TEXT NOT NULL,
  revision           INTEGER NOT NULL,
  fps_num            INTEGER NOT NULL CHECK (fps_num > 0),
  fps_den            INTEGER NOT NULL CHECK (fps_den > 0),
  source_duration_us INTEGER NOT NULL,
  duration_us        INTEGER NOT NULL,
  PRIMARY KEY (edl_id, revision),
  FOREIGN KEY (edl_id, revision) REFERENCES edl_revisions (edl_id, revision)
) STRICT;

CREATE TABLE timeline_clips (
  edl_id          TEXT NOT NULL,
  revision        INTEGER NOT NULL,
  idx             INTEGER NOT NULL CHECK (idx >= 0),
  source_start_us INTEGER NOT NULL,
  source_end_us   INTEGER NOT NULL,
  edited_start_us INTEGER NOT NULL,
  PRIMARY KEY (edl_id, revision, idx),
  FOREIGN KEY (edl_id, revision) REFERENCES timelines (edl_id, revision)
) STRICT;

-- 5. Approvals (`05` §7): subject_ref — "edl:<id>@r<N>" | "plan:<id>@r<N>".
CREATE TABLE approvals (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects (id),
  kind         TEXT NOT NULL CHECK (kind IN ('A', 'B', 'C', 'final')),
  subject_ref  TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('valid', 'stale', 'revoked')),
  stale_reason TEXT CHECK (stale_reason IN ('subject_changed', 'edl_changed', 'style_changed', 'upstream_A')),
  decided_at   TEXT NOT NULL,
  CHECK ((status = 'stale') = (stale_reason IS NOT NULL))
) STRICT;
CREATE INDEX approvals_project ON approvals (project_id, kind, decided_at);

-- 6. Анализ видеоряда и смысловая разметка (иммутабельные каталоги, без ревизий).
CREATE TABLE footage_analyses (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id),
  media_id   TEXT NOT NULL REFERENCES media_assets (id),
  mode       TEXT NOT NULL CHECK (mode IN ('vision+llm', 'vision', 'llm_only')),
  rel_path   TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX footage_project ON footage_analyses (project_id, created_at);

CREATE TABLE semantic_analyses (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects (id),
  transcript_id       TEXT NOT NULL REFERENCES transcripts (id),
  transcript_revision INTEGER NOT NULL,
  edl_id              TEXT NOT NULL REFERENCES edls (id),
  edl_revision        INTEGER NOT NULL,
  rel_path            TEXT NOT NULL,
  sha256              TEXT NOT NULL,
  created_at          TEXT NOT NULL
) STRICT;
CREATE INDEX semantic_project ON semantic_analyses (project_id, created_at);

CREATE TABLE semantic_chapters (
  analysis_id   TEXT NOT NULL REFERENCES semantic_analyses (id),
  chapter_id    TEXT NOT NULL,
  title         TEXT NOT NULL,
  start_word_id TEXT NOT NULL,
  end_word_id   TEXT NOT NULL,
  PRIMARY KEY (analysis_id, chapter_id)
) STRICT;

-- 7. StyleBible проекта (вход Approval B).
CREATE TABLE style_bibles (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id),
  current_revision INTEGER CHECK (current_revision >= 1),
  created_at       TEXT NOT NULL
) STRICT;
CREATE INDEX style_bibles_project ON style_bibles (project_id, created_at);

CREATE TABLE style_revisions (
  style_id   TEXT NOT NULL REFERENCES style_bibles (id),
  revision   INTEGER NOT NULL CHECK (revision >= 1),
  rel_path   TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  hash       TEXT NOT NULL,
  author     TEXT NOT NULL CHECK (author IN ('agent', 'user')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (style_id, revision)
) STRICT;

-- 8. Визуальный план (субъект Approval B): ревизии, возможности и сцены ревизии.
CREATE TABLE visual_plans (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects (id),
  current_revision INTEGER CHECK (current_revision >= 1),
  created_at       TEXT NOT NULL
) STRICT;
CREATE INDEX visual_plans_project ON visual_plans (project_id, created_at);

CREATE TABLE visual_plan_revisions (
  plan_id         TEXT NOT NULL REFERENCES visual_plans (id),
  revision        INTEGER NOT NULL CHECK (revision >= 1),
  parent_revision INTEGER,
  rel_path        TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  hash            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (plan_id, revision)
) STRICT;

CREATE TABLE visual_opportunities (
  plan_id         TEXT NOT NULL,
  revision        INTEGER NOT NULL,
  opp_id          TEXT NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('plan', 'skip')),
  anchor_ids_json TEXT NOT NULL,
  skip_reason     TEXT,
  PRIMARY KEY (plan_id, revision, opp_id),
  FOREIGN KEY (plan_id, revision) REFERENCES visual_plan_revisions (plan_id, revision)
) STRICT;

CREATE TABLE scene_plans (
  plan_id          TEXT NOT NULL,
  revision         INTEGER NOT NULL,
  item_id          TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('proposed', 'accepted', 'rejected', 'stale')),
  composition_mode TEXT NOT NULL,
  zone             TEXT NOT NULL,
  edited_start_us  INTEGER NOT NULL,
  edited_end_us    INTEGER NOT NULL,
  start_word_id    TEXT NOT NULL,
  end_word_id      TEXT NOT NULL,
  visual_type      TEXT NOT NULL,
  PRIMARY KEY (plan_id, revision, item_id),
  FOREIGN KEY (plan_id, revision) REFERENCES visual_plan_revisions (plan_id, revision)
) STRICT;
