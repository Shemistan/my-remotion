-- jobs.type: + 'project.download' — скачивание выбранных роликов проекта в папку человека
-- (пересборка, колонки и индексы — как в 006).
CREATE TABLE jobs_new (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (type IN ('playground.generate', 'playground.edit', 'scene.restore', 'scene.export',
                                                 'media.import', 'asr.transcribe', 'roughcut.propose', 'roughcut.preview',
                                                 'footage.analyze', 'semantic.analyze', 'plan.visual', 'plan.recheck',
                                                 'script.plan', 'script.package',
                                                 'video.package', 'scene.preview_context', 'timeline.build', 'timeline.preview',
                                                 'final.render', 'final.reproduce', 'trash.purge', 'cache.gc',
                                                 'project.download')),
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
