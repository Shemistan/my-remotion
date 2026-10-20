# Происхождение motion-kit v0.1

Весь код kit написан заново и считается от кадра. Из источников взяты приёмы и идеи,
а не файлы: ни один файл и ни один фрагмент кода не скопирован. Лицензии и коммиты
взяты из `knowledge/repositories.json`, идентификаторы — из `knowledge/capabilities.jsonl`.

Restricted-источники не использовались даже как идея: `react-bits` (MIT + Commons
Clause) и `remotion-boilerplate` (UNLICENSED).

`rendered` — итог реального рендера в галерее `render/test/fixtures/kit-gallery`
(1920×1080, 150 кадров, три пресета) и просмотра кадров глазами 2026-10-20. Кадры
лежат в `docs/evidence/phase-1/slice/kit/`.

| Компонент | kb_id | Репозиторий @ commit | Лицензия | Что взято | rendered |
|---|---|---|---|---|---|
| `AnimatedNumber` | `remotion-bits/animated-counter` | remotion-bits @ de35fda | MIT (package.json) | приём: значение = интерполяция с easing, фиксированное число знаков | ok |
| | `free-remotion-templates/kpi-counter` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | идея автоматического выбора K/M в сокращении (у нас — `formatNumber` с «тыс./млн/млрд», своя реализация) | ok |
| | `remotion-motion-graphics-skill/traps` | remotion-motion-graphics-skill @ 1fc2869 | MIT (LICENSE) | правила: clamp при интерполяции кадра, tabular-nums против дрожания цифр | ok |
| `LineChart` | `free-remotion-templates/line-chart-anim` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём: рисование линии через `strokeDasharray/strokeDashoffset` от кадра; точки вспыхивают, когда линия до них доходит; подписи X проявляются вслед. Добавлено своё: монотонная кривая, LUT-длина, «голова», заливка через clipPath, пульс и выноска | ok |
| | `remotion-video-templates/line-chart-draw` | remotion-video-templates @ 9014946 | MIT (LICENSE) | идея оси Y от 0 до максимума с сеткой; у нас «круглые» деления `niceTicks` | ok |
| `FlowGraph` | `xyflow/edge-path-utils` | xyflow @ 654ba5a5e | MIT (LICENSE) | идея: ребро — кубическая кривая между портами узлов, контрольные точки смещены по оси порта | ok |
| | `free-remotion-templates/logo-stroke-draw` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём прорисовки обводки `strokeDasharray` (рёбра) | ok |
| `PulseAlongPath` | `magicui/animated-beam` | magicui @ efe76fc5 | MIT (LICENSE.md) | идея светового луча с градиентом вдоль пути. Переписано на кадры: позиция — `pointAtLength` по своей LUT, без DOM-измерений и CSS-анимации | ok |
| `Card` | `free-remotion-templates/lower-third-glass-card` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | приём «стекла»: вертикальный градиент-блик поверх поверхности, светлая кромка сверху | ok |
| | `remotion-bits/scene-3d` | remotion-bits @ de35fda | MIT (package.json) | идея входа с перспективой (поворот к зрителю); у нас — CSS `perspective/rotateX` от пружины | ok |
| `KineticText` | `remotion-video-templates/kinetic-text` | remotion-video-templates @ 9014946 | MIT (LICENSE) | приём: пружина на каждое слово с задержкой по индексу, подъём и масштаб | ok |
| | `remotion-bits/animated-text` | remotion-bits @ de35fda | MIT (package.json) | идея режимов разбиения по словам и по буквам | ok |
| `Background` | `xyflow/background` | xyflow @ 654ba5a5e | MIT (LICENSE) | идея точечной и линейной сетки-подложки (варианты `paper`, `grid`) | ok |
| | `free-remotion-templates/lower-third-glass-card` | free-remotion-templates @ f648980 | MIT (LICENSE, SPDX) | идея: размытое радиальное пятно акцента, чтобы фон «дышал» (вариант `aurora`) | ok |
| `useBeat`, `beatProgress`, `formatNumber`, геометрия (`pathLUT`, `pointAtLength`, `smoothSegments`), токены, пресеты | — | своё | — | монотонная интерполяция Фритча — Карлсона; LUT длины пути | ok (юнит-тесты, рендер) |

## Шрифты

| Семейство | Пакет | Начертания | Лицензия |
|---|---|---|---|
| Inter | `@fontsource/inter@5.3.0` | 400, 500, 600, 700 | OFL-1.1 |
| Manrope | `@fontsource/manrope@5.3.0` | 600, 700, 800 | OFL-1.1 |
| JetBrains Mono | `@fontsource/jetbrains-mono@5.3.0` | 400, 500, 700 | OFL-1.1 |

Подмножества latin и cyrillic, woff2. Файлы лежат в `fonts/`, тексты лицензий — в
`fonts/OFL.txt`. Обновляет их `app/motion-studio/scripts/sync-fonts.mjs`.

## Итог просмотра кадров (2026-10-20)

- Кириллица везде набрана своим шрифтом: Manrope (заголовки dark-premium), Inter
  (light-clean и подписи), JetBrains Mono (tech-neon и кикеры). Системных подмен нет.
- Обрезки нет. Подписи узлов FlowGraph сначала обрезались многоточием, теперь кегль
  подбирается по ширине узла. Надпись «Уровень 0» в карточках переносилась на две строки —
  исправлено в раскладке галереи.
- Импульсы видны на путях: голова, ореол и хвост; обратный импульс — третьим акцентом.
- Тени различимы по elevation 0–3 во всех трёх пресетах: тень, светлота поверхности,
  у elevation 3 — ореол или неоновое свечение.
