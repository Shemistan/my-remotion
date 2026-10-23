# Экспорт сцены (Task 19, P1-14) — e2e

Прогон 2026-10-23T13:53:36.356Z, Remotion renderMedia, Chrome Headless Shell, ffprobe/ffmpeg системные.
Время — стена экспорта целиком (бандл из кэша, если уже собран, рендер кадров, кодирование, ffprobe).

| Экспорт | Запрос | Время, с | Файл | ffprobe | Заметка |
|---|---|---|---|---|---|
| kit-gallery-30 | {"format":"mp4","crf":18,"scale":1} | 15.7 | 3.5 МБ | h264+aac yuv420p 1920×1080 30/1 5013 мс |  |
| kit-gallery-30-repeat | {"format":"mp4","crf":18,"scale":1} | 8.0 | 3.5 МБ | h264+aac yuv420p 1920×1080 30/1 5013 мс | повтор: бандл из кэша |
| kit-gallery-60 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 11.7 | 2.4 МБ | h264+aac yuv420p 1920×1080 60/1 5013 мс | биты сцены зашиты в коде кадрами 30 fps — темп меняется, сверка кадров — на transparent-scene |
| timed-30 | {"format":"mp4","crf":18,"scale":1} | 9.5 | 0.9 МБ | h264+aac yuv420p 1280×720 30/1 3008 мс |  |
| timed-60 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 4.4 | 0.7 МБ | h264+aac yuv420p 1280×720 60/1 3008 мс |  |
| сверка M11 | {"format":"mp4","crf":18,"scale":1,"fps":60} | 0.0 | — | — | frameDelta кадр 30@30 fps vs 60@60 fps = 0.00431 (< 0.01); тот же номер кадра 30@60 fps = 0.03766 |
| transparent-prores | {"format":"prores4444","crf":18,"scale":1} | 8.6 | 21.6 МБ | prores yuva444p12le 1280×720 30/1 3000 мс |  |
| loopback-export | {"format":"mp4","crf":18,"scale":1} | 7.8 | 0.1 МБ | h264+aac yuv420p 640×360 30/1 2005 мс |  |
| proxy-fetch-export | {"format":"mp4","crf":18,"scale":1} | 7.8 | 0.1 МБ | h264+aac yuv420p 640×360 30/1 2005 мс |  |
| proxy-audio-export | {"format":"mp4","crf":18,"scale":1} | 9.1 | — | — |  |
