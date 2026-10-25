-- Task 29: проекты Phase 1, созданные через UI до Task 29, получили kind = 'video' (тогдашнее
-- умолчание репозитория) и открылись бы как Video Workspace. Видеопроект без исходника, но со
-- сценами — это проект сцен Phase 1: возвращаем ему 'playground'. Проекты с исходником и пустые
-- не трогаем. Умолчание репозитория теперь 'playground'.
UPDATE projects
SET kind = 'playground'
WHERE kind = 'video'
  AND id IN (SELECT project_id FROM scenes)
  AND id NOT IN (SELECT project_id FROM media_assets);
