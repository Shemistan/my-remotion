# Экспорт сцены (Task 19, P1-14) — e2e

Прогон 2026-10-23T14:36:54.921Z, Remotion renderMedia, Chrome Headless Shell, ffprobe/ffmpeg системные.
Время — стена экспорта целиком (бандл из кэша, если уже собран, рендер кадров, кодирование, ffprobe).

| Экспорт | Запрос | Время, с | Файл | ffprobe | Заметка |
|---|---|---|---|---|---|
| kit-gallery-30 | {"format":"mp4","crf":18,"scale":1} | 15.3 | 3.5 МБ | h264+aac yuv420p 1920×1080 30/1 5000 мс |  |
| kit-gallery-30-repeat | {"format":"mp4","crf":18,"scale":1} | 8.5 | 3.5 МБ | h264+aac yuv420p 1920×1080 30/1 5000 мс | повтор: бандл из кэша |
| kit-gallery-60 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 0.0 | — | — | props вне ScenePropsBase — отказ до рендера |
| kit-gallery-60-tempo | {"format":"mp4","crf":18,"scale":1,"fps":60} | 12.6 | 2.4 МБ | h264+aac yuv420p 1920×1080 60/1 5000 мс | кадры зашиты в код — fps_tempo_mismatch |
| kit-gallery-60-tempo: сверка | {"format":"mp4","crf":18,"scale":1,"fps":60} | 0.0 | — | — | худшая клетка по стоп-кадрам: 15→30: 0.3935, 40→80: 0.2583, 70→140: 0.3162, 100→200: 0.1338, 130→260: 0.0473; порог 0.06; расхождение: 15, 40, 70, 100 |
| seven-60 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 8.3 | 1.3 МБ | h264+aac yuv420p 1280×720 60/1 7000 мс | F1: до исправления gate давал duration 7019 мс против 7000 ± 16,667 |
| timed-30 | {"format":"mp4","crf":18,"scale":1} | 9.2 | 0.9 МБ | h264+aac yuv420p 1280×720 30/1 3000 мс |  |
| timed-60 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 5.0 | 0.6 МБ | h264+aac yuv420p 1280×720 60/1 3000 мс |  |
| timed-60: сверка | {"format":"mp4","crf":18,"scale":1,"fps":60} | 0.0 | — | — | худшая клетка: 15→30: 0.0078, 30→60: 0.0083, 45→90: 0.0189, 60→120: 0.0192, 75→150: 0.0194 |
| сверка M11 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 0.0 | — | — | frameDelta кадр 30@30 fps vs 60@60 fps = 0.00339 (< 0.01); тот же номер кадра 30@60 fps = 0.03763 |
| transparent-prores | {"format":"prores4444","crf":18,"scale":1} | 8.8 | 21.6 МБ | prores yuva444p12le 1280×720 30/1 3000 мс |  |
| loopback-export | {"format":"mp4","crf":18,"scale":1} | 7.7 | 0.1 МБ | h264+aac yuv420p 640×360 30/1 2000 мс |  |
| proxy-fetch-export | {"format":"mp4","crf":18,"scale":1} | 7.7 | 0.1 МБ | h264+aac yuv420p 640×360 30/1 2000 мс |  |
| proxy-audio-export | {"format":"mp4","crf":18,"scale":1} | 10.1 | — | — |  |
