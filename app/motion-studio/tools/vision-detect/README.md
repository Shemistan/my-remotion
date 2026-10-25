# vision-detect

Детектор Apple Vision для анализа видеоряда (`footage.analyze`, Task 30): лица
(`VNDetectFaceRectanglesRequest`), люди (`VNDetectHumanRectanglesRequest`), руки — рамка по суставам
`VNDetectHumanHandPoseRequest` (точки с уверенностью ≥ 0,3), салиентность
(`VNGenerateAttentionBasedSaliencyImageRequest`).

```sh
npm run build:vision          # swiftc -O main.swift → bin/vision-detect (bin/ в .gitignore)
bin/vision-detect --version   # vision-detect 2
bin/vision-detect a.png b.png # JSON-массив по кадрам на stdout
```

Вывод: `[{ path, width, height, faces: [{ x, y, w, h, confidence }], humans, hands, saliency, error? }]` —
координаты Vision как есть: доли кадра, начало **слева снизу**. Сервер переводит их в начало слева
сверху (`server/src/analysis/vision.ts`, `fromVisionRect`) и сверяет пути с переданными.

Ограничения: аргументы — только пути PNG (флаги, кроме `--version`, и другие расширения — код 64);
файлы только читаются, сети нет. Кадр, которого нет, который не читается как изображение или
который Vision не обработал, — пустой результат с `width: 0, height: 0` и полем `error` (код 0,
остальные кадры выдаются; сервер помечает шот «детектор не прочитал кадр» и не считает такой кадр
кадром без лица). Код ≠ 0 — только ошибка вызова (64) или сбой сборки JSON (3). Сервер
запускает утилиту через `spawnTracked` (своя группа процессов, реестр попытки, таймаут, отмена) с
путями кадров из draft задачи, не от пользователя.

Сборка входит в `make install` (а значит и в `make check`): пересобирается при изменении
`main.swift`; нет `swiftc` или сборка не удалась — сообщение, `install` не падает. Нет бинарника —
анализ идёт в режиме `llm_only`: зоны по лицу и объектам агента, с пометкой «низкая уверенность
зон». `doctor` показывает строку `vision` со статусом `degraded` (не ошибка, код 0).
