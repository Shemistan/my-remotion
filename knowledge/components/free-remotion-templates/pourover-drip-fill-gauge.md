# Drip Fill Gauge — `free-remotion-templates/pourover-drip-fill-gauge`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `numbers-counters` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Пиксель-арт пуровер: из чайника капает вода в конус-фильтр, стеклянный
графин наполняется полосатой жидкостью с колышущимся мениском; внизу —
пиксельный счётчик «NN%» с подписью VOLUME и шкала-прогресс с отметками
25/50/75 и надписью FULL. Четыре янтарных тона в стиле GameBoy.

## Когда использовать

Метафора наполнения: загрузка, прогресс проекта, «капля за каплей»,
заполненность склада/бюджета. Код всегда наполняет до 100 % и держит; prop
для целевого процента нет (README говорит о «target percentage», но в коде
его нет) — для «до 63 %» нужна правка `progress`.

## Фразы из озвучки

- «капля за каплей мы дошли до цели»
- «бюджет заполнен почти полностью»
- «прогресс растёт с каждым днём»

## Визуальный стиль

Ретро пиксель-арт 480×270 с апскейлом nearest-neighbour, тёплый янтарь
(`#1c1206`, `#6b4410`, `#c88a1e`, `#f6d27a`), Bayer-дизеринг, CRT-сканлайны,
шум, виньетка. Текст — собственный битмап-шрифт 5×7 (`BitmapText`).
1920×1080, 180 кадров.

## Входные данные

`PouroverDripFillGaugeProps`: `toneBg`, `toneDark`, `toneMid`, `toneLight`
(см. выше), `fillSpeed` (0.78 — доля длительности на наполнение),
`showDrips` (true), `beats?: BeatEvent[]` (пульс счётчика по реальным
долям), `waveform?: number[]` (темп наливания по уровням звука).

## Анимации

Прогресс = smoothstep от `frame / (DURATION_FRAMES·fillSpeed)` или интеграл
`waveform`; уровень жидкости и число — от одного прогресса; капли —
`particleField` из pixel-kit; мениск `sin(frame·0.18)`; пульс `idlePulse`
96 BPM или `computePulse(beats)` подсвечивает число.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/pourover-drip-fill-gauge/PouroverDripFillGauge.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts` — реэкспорт pixel-kit
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/render.tsx` — `PixelStage`, `idlePulse`, `computePulse`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/fx.tsx` — `BitmapText`, `PixelDither`, `Crt*`
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion`, `react`, внутренний `src/pixel-kit`.

## Совместимость и адаптация

`native`. Прогресс от константы `DURATION_FRAMES = 180` и FPS 30, не от
`useVideoConfig`. Набор глифов `BitmapText` не проверялся (кириллица — нет
данных).

## Паттерны

`quantities`, `growth-decline`, `abstract-concepts`
