# Экспорт сцены через задачу scene.export (Task 19) — реальное хранилище

Прогон 2026-10-23T14:40:11.428Z, версия ver_01M5ME1VZRFDHPPGV29D2VP2DA (v4), restore v1
Время — стена задачи от постановки в очередь до итога (рендер под семафором, gate, публикация).

| Экспорт | Версия | Запрос | Итог | Время, с | ffprobe / ошибка | Сверка темпа (кадр → кадр экспорта: худшая клетка) | export_id |
|---|---|---|---|---|---|---|---|
| mp4-30 | ver_01M5ME1VZRFDHPPGV29D2VP2DA | {"format":"mp4","crf":18,"scale":1} | completed | 14.1 | h264+aac 1920×1080 30/1 6000 мс | — | exp_01M5MK78G7WXWMR2S9QHQBRTJZ |
| mp4-30-repeat | ver_01M5ME1VZRFDHPPGV29D2VP2DA | {"format":"mp4","crf":18,"scale":1} | completed | 11.0 | h264+aac 1920×1080 30/1 6000 мс | — | exp_01M5MK7KWTQ5TJGJXD3WB2BSBA |
| mp4-60 | ver_01M5ME1VZRFDHPPGV29D2VP2DA | {"format":"mp4","crf":18,"scale":1,"fps":60} | completed | 19.1 | h264+aac 1920×1080 60/1 6000 мс | 13→26: 0.0065, 43→86: 0.0077, 70→140: 0.0203, 102→204: 0.0123, 120→240: 0.0092, 132→264: 0.0088, 156→312: 0.0093, 179→358: 0.012 | exp_01M5MK86N89MDVX0WQTKW5P7QE |
| legacy-literal-60 | ver_01M5DMCGPHDYW1PHKNF5MDW7M2 | {"format":"mp4","crf":18,"scale":1,"fps":60} | failed | 1.0 | fps_change_unsupported: props версии вне договора ScenePropsBase — кадры сцены под 60 fps не пересчитать; экспортируйте в исходном fps (30) или перегенерируйте сцену | — | — |
| base-literal-60 | ver_01M5HCCPW99S3B0B3H1KC8TR4H | {"format":"mp4","crf":18,"scale":1,"fps":60} | completed | 24.1 | h264+aac 1920×1080 60/1 6000 мс | 5→10: 0.0093, 34→68: 0.0288, 49→98: 0.054, 87→174: 0.0209, 105→210: 0.0112, 123→246: 0.0095, 151→302: 0.0098, 179→358: 0.0119 | exp_01M5MK8YMS7S2JG6PSG383BD8A |
| prores-opaque | ver_01M5ME1VZRFDHPPGV29D2VP2DA | {"format":"prores4444","crf":18,"scale":1} | failed | 1.0 | transparent_unsupported: версия сделана с непрозрачным фоном; включите прозрачный экспорт до генерации | — | — |
