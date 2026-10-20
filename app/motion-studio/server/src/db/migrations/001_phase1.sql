-- Phase 1 (05-data-model §3). Время — ISO 8601 UTC с миллисекундами (TEXT).
-- JSON-столбцы (*_json) — текст JSON, разбирают репозитории.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('playground', 'video')),
  title         TEXT NOT NULL,
  settings_json TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
) STRICT;

INSERT INTO projects (id, kind, title, settings_json, created_at, updated_at)
VALUES ('playground', 'playground', 'Playground', NULL,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE scenes (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects (id),
  title               TEXT NOT NULL,
  current_version_id  TEXT REFERENCES scene_versions (id),
  approved_version_id TEXT REFERENCES scene_versions (id),
  created_at          TEXT NOT NULL
) STRICT;
CREATE INDEX scenes_project ON scenes (project_id, created_at);

-- Задачи (ADR 0002, 0007): attempt — fencing-токен; max_attempts сравнивается с interrupts.
CREATE TABLE jobs (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('playground.generate', 'playground.edit', 'scene.restore', 'scene.export')),
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
CREATE INDEX jobs_status ON jobs (status, created_at);
CREATE INDEX jobs_scene ON jobs (scene_id, created_at);

-- Версии: только опубликованные (ready | failed); draft в БД не регистрируется (Q9).
CREATE TABLE scene_versions (
  id                TEXT PRIMARY KEY,
  scene_id          TEXT NOT NULL REFERENCES scenes (id),
  parent_version_id TEXT REFERENCES scene_versions (id),
  number            INTEGER NOT NULL CHECK (number >= 1),
  status            TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  prompt            TEXT NOT NULL,
  edit_plan_json    TEXT,
  settings_json     TEXT NOT NULL,
  path              TEXT NOT NULL UNIQUE,
  manifest_sha256   TEXT NOT NULL,
  created_by_job_id TEXT REFERENCES jobs (id),
  created_at        TEXT NOT NULL,
  -- Не NULL: каталог версии пропал и не восстановлен при старте (reconcile_versions) — причина.
  broken_reason     TEXT,
  UNIQUE (scene_id, number)
) STRICT;

CREATE TABLE chat_messages (
  id         TEXT PRIMARY KEY,
  scene_id   TEXT NOT NULL REFERENCES scenes (id),
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text       TEXT NOT NULL,
  version_id TEXT REFERENCES scene_versions (id),
  job_id     TEXT REFERENCES jobs (id),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX chat_scene ON chat_messages (scene_id, created_at);

-- Журнал задач для SSE: id монотонный (AUTOINCREMENT не переиспользует удалённые).
CREATE TABLE job_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id    TEXT NOT NULL REFERENCES jobs (id),
  ts        TEXT NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  kind      TEXT NOT NULL,
  message   TEXT NOT NULL,
  data_json TEXT
) STRICT;
CREATE INDEX job_events_job ON job_events (job_id, id);

CREATE TABLE agent_runs (
  id                      TEXT PRIMARY KEY,
  job_id                  TEXT NOT NULL REFERENCES jobs (id),
  role                    TEXT NOT NULL,
  model                   TEXT NOT NULL,
  status                  TEXT NOT NULL,
  input_tokens            INTEGER,
  output_tokens           INTEGER,
  cost_usd                REAL,
  session_id              TEXT,
  permission_denials_json TEXT,
  log_dir                 TEXT,
  started_at              TEXT NOT NULL,
  finished_at             TEXT
) STRICT;

-- version_id без FK: превью рендерится в draft до публикации версии.
CREATE TABLE render_jobs (
  id           TEXT PRIMARY KEY,
  job_id       TEXT NOT NULL REFERENCES jobs (id),
  version_id   TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('still', 'preview', 'export')),
  codec        TEXT,
  width        INTEGER,
  height       INTEGER,
  fps_num      INTEGER,
  fps_den      INTEGER,
  frames       INTEGER,
  output_path  TEXT,
  ffprobe_json TEXT,
  duration_ms  REAL
) STRICT;

CREATE TABLE qa_reports (
  id          INTEGER PRIMARY KEY,
  version_id  TEXT NOT NULL REFERENCES scene_versions (id),
  attempt     INTEGER NOT NULL,
  technical   TEXT NOT NULL CHECK (technical IN ('pass', 'warn', 'fail', 'not_checked')),
  visual      TEXT NOT NULL CHECK (visual IN ('pass', 'warn', 'fail', 'not_checked')),
  semantic    TEXT NOT NULL CHECK (semantic IN ('pass', 'warn', 'fail', 'not_checked')),
  style       TEXT NOT NULL CHECK (style IN ('pass', 'warn', 'fail', 'not_checked')),
  report_path TEXT NOT NULL
) STRICT;

CREATE TABLE knowledge_refs (
  id                INTEGER PRIMARY KEY,
  version_id        TEXT NOT NULL REFERENCES scene_versions (id),
  kb_id             TEXT NOT NULL,
  repo              TEXT,
  "commit"          TEXT NOT NULL,
  license           TEXT NOT NULL,
  license_class     TEXT CHECK (license_class IN ('permissive', 'restricted', 'unknown')),
  strategy          TEXT NOT NULL CHECK (strategy IN ('reuse', 'adapt', 'build')),
  source_paths_json TEXT
) STRICT;
CREATE INDEX knowledge_refs_version ON knowledge_refs (version_id);

CREATE TABLE exports (
  id         TEXT PRIMARY KEY,
  version_id TEXT NOT NULL REFERENCES scene_versions (id),
  job_id     TEXT REFERENCES jobs (id),
  format     TEXT NOT NULL CHECK (format IN ('mp4', 'prores4444')),
  path       TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

-- Реальные рендер-проверки компонентов KB (результат как в KB: rendered-ok | rendered-fail).
CREATE TABLE component_tests (
  kb_id            TEXT NOT NULL,
  remotion_version TEXT NOT NULL,
  result           TEXT NOT NULL CHECK (result IN ('rendered-ok', 'rendered-fail')),
  version_id       TEXT REFERENCES scene_versions (id),
  date             TEXT NOT NULL,
  PRIMARY KEY (kb_id, remotion_version)
) STRICT;

CREATE TABLE scene_locks (
  scene_id    TEXT PRIMARY KEY REFERENCES scenes (id),
  job_id      TEXT NOT NULL REFERENCES jobs (id),
  acquired_at TEXT NOT NULL
) STRICT;

-- Реестр дочерних процессов (ADR 0007). Без FK на jobs: запись процесса не должна падать,
-- иначе процесс останется без учёта. started_at — время старта из `ps` (сверка pid).
CREATE TABLE job_processes (
  job_id     TEXT NOT NULL,
  attempt    INTEGER NOT NULL CHECK (attempt >= 1),
  pid        INTEGER NOT NULL,
  pgid       INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  cmd        TEXT NOT NULL,
  ended_at   TEXT,
  exit_code  INTEGER,
  PRIMARY KEY (job_id, attempt, pid)
) STRICT;
CREATE INDEX job_processes_live ON job_processes (ended_at);
