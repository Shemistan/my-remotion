-- Phase 4–6 (Task 35′, ADR 0009): видеосцены через сценарный конвейер, таймлайн, финал,
-- управление проектами. Одна миграция на все новые типы задач и таблицы (Р-V3). Пересборки —
-- как в 003/005: внешние ключи на время миграции выключает migrate(), целостность —
-- foreign_key_check до COMMIT.

-- 1. jobs.type: + 8 типов Phase 4–6 (пересборка, колонки и индексы — как в 005).
CREATE TABLE jobs_new (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('playground.generate', 'playground.edit', 'scene.restore', 'scene.export',
                                                 'media.import', 'asr.transcribe', 'roughcut.propose', 'roughcut.preview',
                                                 'footage.analyze', 'semantic.analyze', 'plan.visual', 'plan.recheck',
                                                 'script.plan', 'script.package',
                                                 'video.package', 'scene.preview_context', 'timeline.build', 'timeline.preview',
                                                 'final.render', 'final.reproduce', 'trash.purge', 'cache.gc')),
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

-- 2. approvals: subject_key (субъект без ревизии — область C и final, Р-V4), причины устаревания
--    C/final. rowid переносится явно: latestActive упорядочивает по rowid (часы могут идти назад).
CREATE TABLE approvals_new (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects (id),
  kind         TEXT NOT NULL CHECK (kind IN ('A', 'B', 'C', 'final')),
  subject_ref  TEXT NOT NULL,
  subject_key  TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('valid', 'stale', 'revoked')),
  stale_reason TEXT CHECK (stale_reason IN ('subject_changed', 'edl_changed', 'style_changed', 'upstream_A',
                                            'plan_changed', 'version_changed', 'timeline_changed')),
  decided_at   TEXT NOT NULL,
  CHECK ((status = 'stale') = (stale_reason IS NOT NULL))
) STRICT;
INSERT INTO approvals_new (rowid, id, project_id, kind, subject_ref, subject_key, subject_hash, status, stale_reason, decided_at)
SELECT rowid, id, project_id, kind, subject_ref, substr(subject_ref, 1, instr(subject_ref, '@') - 1), subject_hash, status, stale_reason, decided_at
FROM approvals ORDER BY rowid;
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;
CREATE INDEX approvals_project ON approvals (project_id, kind, decided_at);
CREATE INDEX approvals_subject ON approvals (project_id, kind, subject_key);

-- 3. Архив и удаление проекта (Task 47): корзина `workspace/trash/<project>-<ts>/` + отметка.
ALTER TABLE projects ADD COLUMN archived_at TEXT;
ALTER TABLE projects ADD COLUMN deleted_at TEXT;

-- 4. Пакет генерации видеосцен (Р-V2): утверждение B ревизии плана и задачи сцен.
CREATE TABLE video_batches (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects (id),
  plan_id       TEXT NOT NULL REFERENCES visual_plans (id),
  plan_revision INTEGER NOT NULL CHECK (plan_revision >= 1),
  approval_id   TEXT REFERENCES approvals (id),
  created_at    TEXT NOT NULL
) STRICT;
CREATE INDEX video_batches_project ON video_batches (project_id, created_at);

-- 5. Сцена Playground на сцену плана (как script_scenes, без формата): job_id — последняя задача
--    генерации; item_fingerprint — отпечаток сцены плана при постановке (Task 37′).
CREATE TABLE video_scenes (
  project_id       TEXT NOT NULL REFERENCES projects (id),
  plan_id          TEXT NOT NULL REFERENCES visual_plans (id),
  item_id          TEXT NOT NULL,
  scene_id         TEXT NOT NULL UNIQUE REFERENCES scenes (id),
  batch_id         TEXT REFERENCES video_batches (id),
  job_id           TEXT REFERENCES jobs (id),
  item_fingerprint TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  PRIMARY KEY (plan_id, item_id)
) STRICT;

-- 6. Папка клипов видеопроекта (Phase 5-lite): `packages/<id>`, манифест — package-manifest.json.
CREATE TABLE video_packages (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects (id),
  job_id          TEXT REFERENCES jobs (id),
  rel_path        TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  created_at      TEXT NOT NULL
) STRICT;
CREATE INDEX video_packages_project ON video_packages (project_id, created_at);

-- 7. Таймлайн проекта: один на проект, ревизии `timeline/<id>/r<N>/timeline.json` (hash — субъект final).
CREATE TABLE video_timelines (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL UNIQUE REFERENCES projects (id),
  current_revision INTEGER CHECK (current_revision >= 1),
  created_at       TEXT NOT NULL
) STRICT;

CREATE TABLE video_timeline_revisions (
  timeline_id     TEXT NOT NULL REFERENCES video_timelines (id),
  revision        INTEGER NOT NULL CHECK (revision >= 1),
  parent_revision INTEGER CHECK (parent_revision >= 1),
  rel_path        TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  hash            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (timeline_id, revision)
) STRICT;

-- 8. Экспорт финала `final/<id>`: approval final, настройки, хеш входов; не прошёл проверку —
--    failed_verification (файл сохранён, UI не показывает его как успех).
CREATE TABLE final_exports (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects (id),
  timeline_id       TEXT NOT NULL REFERENCES video_timelines (id),
  timeline_revision INTEGER NOT NULL CHECK (timeline_revision >= 1),
  approval_id       TEXT REFERENCES approvals (id),
  request_json      TEXT NOT NULL,
  inputs_hash       TEXT NOT NULL,
  rel_path          TEXT NOT NULL,
  sha256            TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('ready', 'failed_verification')),
  job_id            TEXT REFERENCES jobs (id),
  created_at        TEXT NOT NULL,
  FOREIGN KEY (timeline_id, timeline_revision) REFERENCES video_timeline_revisions (timeline_id, revision)
) STRICT;
CREATE INDEX final_exports_project ON final_exports (project_id, created_at);

-- 9. Корзина (Task 47, F14): что перенесено при удалении проекта; purged_at — очищено trash.purge.
CREATE TABLE trash (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id),
  rel_path   TEXT NOT NULL,
  bytes      INTEGER NOT NULL CHECK (bytes >= 0),
  created_at TEXT NOT NULL,
  purged_at  TEXT
) STRICT;
CREATE INDEX trash_project ON trash (project_id, created_at);

-- 10. Отчёты старта сервера (Task 47): был ли сбой, что восстановлено; acknowledged_at — человек видел.
CREATE TABLE boot_reports (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  crashed         INTEGER NOT NULL CHECK (crashed IN (0, 1)),
  report_json     TEXT NOT NULL,
  acknowledged_at TEXT
) STRICT;
