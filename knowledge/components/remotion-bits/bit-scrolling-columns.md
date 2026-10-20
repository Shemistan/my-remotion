# Scrolling Columns in 3D (bit) — `remotion-bits/bit-scrolling-columns`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Четыре колонки цветных карточек с цифрами плывут вниз с разной скоростью
на разной глубине, а камера медленно панорамирует по сцене в перспективе —
«стена» контента в 3D.

## Когда использовать

Витрина портфолио/шаблонов/клиентов, «огромный каталог», динамичный фон
для интро. Карточки — заглушки, их заменяют скриншотами. Плоский вариант
без 3D — компонент `scrolling-images`.

## Фразы из озвучки

- «сотни готовых шаблонов»
- «посмотрите, сколько уже создано»
- «контент льётся непрерывным потоком»

## Визуальный стиль

Тёмный фон `#111827`, карточки 15 % ширины (×1.2 по высоте) в 15 цветах
Tailwind (red/blue/emerald/amber/violet), цифры 1–9, тени; перспектива 2000.
300 кадров, 1920×1080.

## Входные данные

Без props. `columns` — 4 объекта `{x, speed (4–7 px/кадр), color, z}`;
`itemWidth`, `gap=30`, `cardColors`; внутренний компонент `ImagePlaceholder
{color, width, height, text}`. `Scene3D`: `perspective={2000}`,
`transitionDuration={durationInFrames}`, `stepDuration={1}`, `activeStep={1}`,
`easing="easeIn"`; два `Step` (`start`, `end`) задают начало и конец пана.

## Анимации

Камера летит от шага `start` к `end` всю длительность (easeIn). Колонки —
`Spawner` с `velocity.y = speed` и `rate = speed/(itemHeight+gap)`, чтобы
карточки шли вплотную; `startFrame={150}` — колонки заполнены сразу; цвет
карточки выбирается по seed частицы.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/ScrollingColumns.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/scrolling-columns.mdx` — документация

## Зависимости

`remotion` (`AbsoluteFill`, `useVideoConfig`), `remotion-bits` (`Particles`,
`Spawner`, `Scene3D`, `Step`, `useViewportRect`); registry: `particle-system`,
`scene-3d`, `use-viewport-rect`. Карточки — `particle-system.md`, `scene-3d.md`.

## Совместимость и адаптация

`native`. Для настоящих картинок вставить `Img` из `remotion` в
`ImagePlaceholder` (не `<img>`). `ImagePlaceholder` объявлен внутри
`Component` — каждый кадр новый тип и перемонтирование; вынести наружу.
`lifespan = duration + 200` при rate ≈0.02 — частиц немного, но реплей
длинный: рендер медленнее обычного.

## Паттерны

`quantities`, `spatial`
