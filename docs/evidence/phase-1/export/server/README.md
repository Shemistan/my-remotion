# Экспорт сцены через задачу scene.export (Task 19) — реальное хранилище

Прогон 2026-10-23T13:54:53.996Z, версия ver_01M5ME1VZRFDHPPGV29D2VP2DA (v4), restore v1
Время — стена задачи от постановки в очередь до итога (рендер под семафором, gate, публикация).

| Экспорт | Запрос | Итог | Время, с | ffprobe | export_id |
|---|---|---|---|---|---|
| mp4-30 | {"format":"mp4","crf":18,"scale":1} | completed | 17.1 | h264+aac 1920×1080 30/1 6016 мс | exp_01M5MGN7NZ94ZMR4NB0CZZENPQ |
| mp4-30-repeat | {"format":"mp4","crf":18,"scale":1} | completed | 10.1 | h264+aac 1920×1080 30/1 6016 мс | exp_01M5MGNHG3BKBVAPGCQSA236S6 |
| mp4-60 | {"format":"mp4","crf":18,"scale":1,"fps":60} | completed | 16.1 | h264+aac 1920×1080 60/1 6016 мс | exp_01M5MGP12N1X0PY01WSWB2715F |
| prores-opaque | {"format":"prores4444","crf":18,"scale":1} | failed | 1.0 | transparent_unsupported: версия сделана с непрозрачным фоном; включите прозрачный экспорт до генерации | — |
