-- Замки ресурсов проекта (ruling V8): обобщение scene_locks для задач Phase 2+
-- (медиа, транскрипт, EDL). Ключ задаёт `lockKeyFor(job)`; типы Phase 1 замков не берут.
CREATE TABLE resource_locks (
  resource    TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs (id),
  acquired_at TEXT NOT NULL
) STRICT;
CREATE INDEX resource_locks_job ON resource_locks (job_id);
