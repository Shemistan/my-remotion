# GaugeChart — `animata/gauge-chart`

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

Спидометр: незамкнутое кольцо с разрывом внизу (размер разрыва — `gap` в px
длины дуги), цветная дуга заполняет его на `progress` %, в центре
опционально крупное значение моноширинным шрифтом.

## Когда использовать

Оценка, уровень, «индекс», скорость, удовлетворённость, нагрузка на
систему. Для доли целого — `animata/donut-chart`.

## Фразы из озвучки

- «индекс удовлетворённости — 70 баллов»
- «нагрузка почти на максимуме»
- «стрелка уходит в зелёную зону»

## Визуальный стиль

SVG, цвета Tailwind text-классами: дуга `text-green-500`, дорожка
`text-black/10 dark:text-white/10`; значение `font-mono font-bold`, размер
`size/4`.

## Входные данные

`GaugeChartProps`: `size: number`, `gap: number` (px «выреза»), `progress:
number` (клампится 0–100), `showValue?` (выводит `progress`),
`progressClassName?` (`"text-green-500"`), `trackClassName?`, `circleWidth?`
(16), `progressWidth?` (16), `rounded?` (true), `className?`, `children?`.
Пример story: `gap 100, progress 70, size 150, widths 10, showValue`.

## Анимации

`setTimeout(250)` переключает прогресс 0 → `progress`;
`strokeDashoffset = C − progress/100·(C − gap)`; поворот обеих окружностей
`rotate(90 + gap/(2C)·360)`. Как у donut — только `duration-500`, без
`transition-property`.

## Исходники и документация

- `templates/react-libriry/animata/animata/graphs/gauge-chart.tsx` — компонент
- `templates/react-libriry/animata/content/docs/graphs/gauge-chart.mdx` — документация
- `templates/react-libriry/animata/animata/graphs/gauge-chart.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Убрать `setTimeout`, прогресс = `progress · p(frame)`; значение в центре
выводить как `Math.round(progress · p)`, чтобы цифра «бежала» вместе с
дугой.

## Паттерны

`quantities`, `growth-decline`
