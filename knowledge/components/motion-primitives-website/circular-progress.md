# CircularProgress — `motion-primitives-website/circular-progress`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Кольцо прогресса (SVG): дуга пружинно дорастает до процента, в центре —
процент или произвольный контент.

## Когда использовать

Доля, процент выполнения, KPI-кольцо («72 % клиентов довольны»),
сравнение нескольких колец в ряд.

## Фразы из озвучки

- «72 процента пользователей возвращаются»
- «задача выполнена на три четверти»
- «доля рынка — почти половина»

## Визуальный стиль

Диаметр `size` 80 px, `strokeWidth` 6, `strokeLinecap round`, старт
сверху (`-rotate-90`); фон `stroke-muted`, дуга `stroke-primary`
(переменные темы); центр `text-sm font-semibold tabular-nums`.

## Входные данные

`CircularProgressProps`: `value: number`; `max?` (100); `size?` (80);
`strokeWidth?` (6); `color?` (`'stroke-primary'`); `showValue?` (true);
`children?`; `className?`.

## Анимации

`useSpring(circumference, {stiffness: 100, damping: 20})` →
`strokeDashoffset` до `C*(1 - p/100)`; число в центре — сразу целевое.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/progress.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Circular Progress»

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `k = spring({frame: frame - s, fps, config: {stiffness: 100, damping: 20}})`,
`strokeDashoffset = C - (percentage/100)*C*k`; число в центре —
`Math.round(percentage*k)`; классы `stroke-*` темы заменить цветами
(`stroke="#…"`).

## Паттерны

`quantities`, `comparison`, `growth-decline`
