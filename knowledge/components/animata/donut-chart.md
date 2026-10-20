# DonutChart — `animata/donut-chart`

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

Кольцевой индикатор одной доли: серая дорожка и цветная дуга, заполненная
на `progress` % по часовой стрелке от 12 часов; в центр можно положить
`children` (число, иконку).

## Когда использовать

Один процент/доля: «73 % пользователей», выполнение плана, заполненность.
Несколько долей разом — `animata/ring-chart`; спидометр — `animata/gauge-chart`.

## Фразы из озвучки

- «три четверти клиентов возвращаются»
- «план выполнен на 90 процентов»
- «доля рынка — 30 %»

## Визуальный стиль

Плоский SVG; цвета через Tailwind text-классы (stroke = `currentColor`):
дуга `text-green-500`, дорожка `text-black/10 dark:text-white/10`; концы дуги
скруглены.

## Входные данные

`DonutChartProps`: `size: number` (px, обязателен), `progress: number`
(0–100, обязателен, без клампа), `progressClassName?` (`"text-green-500"`),
`trackClassName?` (`"text-black/10 dark:text-white/10"`), `circleWidth?` (16),
`progressWidth?` (16), `rounded?` (true → `strokeLinecap: round`),
`className?`, `children?`. Радиус = `size/2 − max(widths)/2`.

## Анимации

`stroke-dashoffset` из `circumference` в `circumference·(100−progress)/100`
после `setTimeout(250)`. Классы `duration-500` есть, но
`transition-property` не задан — переход, вероятно, мгновенный (не
проверено рендером).

## Исходники и документация

- `templates/react-libriry/animata/animata/graphs/donut-chart.tsx` — компонент
- `templates/react-libriry/animata/content/docs/graphs/donut-chart.mdx` — документация
- `templates/react-libriry/animata/animata/graphs/donut-chart.stories.tsx` — пример (`size 200, progress 30`)

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Чистый SVG — идеален для кадра: убрать `setTimeout`, `strokeDashoffset =
C·(1 − progress/100·p)`, `p = interpolate(frame, [s, s+30], [0,1], {easing:
Easing.out(Easing.cubic), clamp})`. В `children` — счётчик (`animata/counter`
после адаптации) синхронно с `p`.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
