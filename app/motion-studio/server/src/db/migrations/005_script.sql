-- Сценарный проект «сценарий → моушн-сцены» (спека 2026-10-24-script-to-motion §5.4).
-- Документы ревизий текста лежат в `script/<id>/r<N>` (`a-w`), план — в `plan/<id>/r<N>/script-plan.json`
-- и индексируется таблицами visual_plans/visual_plan_revisions; здесь — индекс текста, пакеты
-- генерации, сцены плана по форматам и пакеты экспорта.

-- 1. projects.kind: + 'script'. CHECK в SQLite не меняется — таблица пересобирается (как jobs в 003;
--    внешние ключи на время миграции выключает migrate(), целостность — foreign_key_check).
CREATE TABLE projects_new (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('playground', 'video', 'script')),
  title         TEXT NOT NULL,
  settings_json TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
) STRICT;
INSERT INTO projects_new (id, kind, title, settings_json, created_at, updated_at)
SELECT id, kind, title, settings_json, created_at, updated_at FROM projects ORDER BY rowid;
DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

-- 2. jobs.type: + 'script.plan', 'script.package' (пересборка, колонки — как в 003).
CREATE TABLE jobs_new (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('playground.generate', 'playground.edit', 'scene.restore', 'scene.export',
                                                 'media.import', 'asr.transcribe', 'roughcut.propose', 'roughcut.preview',
                                                 'footage.analyze', 'semantic.analyze', 'plan.visual', 'plan.recheck',
                                                 'script.plan', 'script.package')),
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

-- 3. Текст сценария: один на проект, ревизии r<N> (hash — canonicalHash документа, вход плана).
CREATE TABLE scripts (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL UNIQUE REFERENCES projects (id),
  current_revision INTEGER CHECK (current_revision >= 1),
  created_at       TEXT NOT NULL
) STRICT;

CREATE TABLE script_revisions (
  script_id  TEXT NOT NULL REFERENCES scripts (id),
  revision   INTEGER NOT NULL CHECK (revision >= 1),
  rel_path   TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (script_id, revision)
) STRICT;

-- 4. Пакет генерации: утверждение B ревизии плана и задачи сцен одного формата.
CREATE TABLE script_batches (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects (id),
  plan_id       TEXT NOT NULL REFERENCES visual_plans (id),
  plan_revision INTEGER NOT NULL CHECK (plan_revision >= 1),
  aspect        TEXT NOT NULL CHECK (aspect IN ('16:9', '9:16')),
  approval_id   TEXT REFERENCES approvals (id),
  created_at    TEXT NOT NULL
) STRICT;
CREATE INDEX script_batches_project ON script_batches (project_id, created_at);

-- 5. Сцена Playground на сцену плана и формат; job_id — последняя задача генерации;
--    item_fingerprint — отпечаток сцены плана (границы, приём, паттерн, идея, назначение, длина,
--    ревизия стиля) при постановке: у текущего плана другой — сцена устарела.
CREATE TABLE script_scenes (
  project_id TEXT NOT NULL REFERENCES projects (id),
  plan_id    TEXT NOT NULL REFERENCES visual_plans (id),
  item_id    TEXT NOT NULL,
  aspect     TEXT NOT NULL CHECK (aspect IN ('16:9', '9:16')),
  scene_id   TEXT NOT NULL UNIQUE REFERENCES scenes (id),
  batch_id   TEXT REFERENCES script_batches (id),
  job_id     TEXT REFERENCES jobs (id),
  item_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (plan_id, item_id, aspect)
) STRICT;

-- 6. Пакет экспорта: папка `packages/<id>` (манифест — package-manifest.json в ней).
CREATE TABLE script_packages (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects (id),
  job_id          TEXT REFERENCES jobs (id),
  aspect          TEXT NOT NULL CHECK (aspect IN ('16:9', '9:16')),
  rel_path        TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  created_at      TEXT NOT NULL
) STRICT;
CREATE INDEX script_packages_project ON script_packages (project_id, created_at);
