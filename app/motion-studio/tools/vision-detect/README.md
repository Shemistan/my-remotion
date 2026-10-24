# vision-detect

Детектор Apple Vision для анализа видеоряда (`footage.analyze`, Task 30): лица
(`VNDetectFaceRectanglesRequest`), люди (`VNDetectHumanRectanglesRequest`), руки — рамка по суставам
`VNDetectHumanHandPoseRequest` (точки с уверенностью ≥ 0,3), салиентность
(`VNGenerateAttentionBasedSaliencyImageRequest`).

```sh
npm run build:vision          # swiftc -O main.swift → bin/vision-detect (bin/ в .gitignore)
bin/vision-detect --version   # vision-detect 1
bin/vision-detect a.png b.png # JSON-массив по кадрам на stdout
```

Вывод: `[{ path, width, height, faces: [{ x, y, w, h, confidence }], humans, hands, saliency }]` —
координаты Vision как есть: доли кадра, начало **слева снизу**. Сервер переводит их в начало слева
сверху (`server/src/analysis/vision.ts`, `fromVisionRect`) и сверяет пути с переданными.

Ограничения: аргументы — только пути PNG (флаги, кроме `--version`, и другие расширения — код 64);
файлы только читаются, сети нет. Ошибка чтения или Vision — код 2/3 и сообщение в stderr. Сервер
запускает утилиту через `spawnTracked` (своя группа процессов, реестр попытки, таймаут, отмена) с
путями кадров из draft задачи, не от пользователя.

Нет бинарника (не собран, нет `swiftc`) — анализ идёт в режиме `llm_only`: зоны по объектам агента,
с пометкой «низкая уверенность зон». `doctor` показывает строку `vision`.
