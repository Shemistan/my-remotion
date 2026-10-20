# RingChart — `animata/ring-chart`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `timers`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Концентрические кольца активности в стиле Apple Watch на тёмной плашке
`bg-zinc-950 rounded-3xl`: каждое кольцо — отдельная доля 0–100 % своим
цветом и полупрозрачной дорожкой того же цвета.

## Когда использовать

2–4 показателя в процентах рядом: цели «движение/упражнения/стояние»,
выполнение планов по направлениям. Для сравнения абсолютных значений —
бары.

## Фразы из озвучки

- «по всем трём целям есть прогресс»
- «движение — 60 %, тренировки — 40 %»
- «кольца почти замкнулись»

## Визуальный стиль

Спортивный, яркий на тёмном; по умолчанию rose-600 / lime-500 / teal-400.

## Входные данные

`RingChartProps`: `rings: { progress: number; trackClassName: string;
progressClassName: string; className? }[]` (по умолчанию `sampleRings` —
10/60/40 %), `size?` (96 — диаметр внутреннего кольца), `gap?` (4), `width?`
(20 — толщина кольца), `className?`. Диаметр кольца i = `size + (n−i)·2·width
+ 2·gap·(n−i)`; первое в массиве — внешнее.

## Анимации

Наследует `animata/donut-chart`: `setTimeout(250)` → `stroke-dashoffset`
(одновременно у всех колец).

## Исходники и документация

- `templates/react-libriry/animata/animata/graphs/ring-chart.tsx` — компонент
- `templates/react-libriry/animata/animata/graphs/donut-chart.tsx` — кольцо
- `templates/react-libriry/animata/content/docs/graphs/ring-chart.mdx` — документация
- `templates/react-libriry/animata/animata/graphs/ring-chart.stories.tsx` — пример

## Зависимости

`@/animata/graphs/donut-chart`, `@/lib/utils`.

## Совместимость и адаптация

Адаптировать `donut-chart` (прогресс из кадра) и добавить stagger по
кольцам: `p_i = interpolate(frame, [s + i·8, s + i·8 + 30], [0,1])`.

## Паттерны

`quantities`, `comparison`
