-- S20: владелец записи процесса. Сервер на копии хранилища видит в job_processes живые pid
-- оригинала: убивать можно только процессы, чей владелец мёртв (owner_pid + owner_started_at не
-- совпадают с живым процессом) и чей лидер осиротел (ppid = 1 или этот сервер). owner_nonce —
-- случайный id захвата owner-lock. foreign_owner — pid живого чужого владельца/родителя: процесс
-- не тронут, ended_at не ставится, задача — blocked(stale_process). Старые строки без owner_* —
-- только проверка родителя.
ALTER TABLE job_processes ADD COLUMN owner_pid INTEGER;
ALTER TABLE job_processes ADD COLUMN owner_started_at TEXT;
ALTER TABLE job_processes ADD COLUMN owner_nonce TEXT;
ALTER TABLE job_processes ADD COLUMN foreign_owner INTEGER;
