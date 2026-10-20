# BlocksPreloader — `motion-primitives-website/blocks-preloader`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Полноэкранная сетка блоков (по умолчанию 4×6), которые по порядку
«загораются» по мере роста прогресса — прогресс как заполнение сетки.

## Когда использовать

Интро-загрузка, «шаг за шагом заполняем», доля как число клеток
(«18 из 24»), визуальный счётчик дней/задач.

## Фразы из озвучки

- «заполнено уже три четверти»
- «каждый блок — выполненная задача»
- «шаг за шагом к цели»

## Визуальный стиль

`grid gap-2 p-4`, блоки `rounded-sm`; заполненные — `color` (`#fff`)
`opacity 1 scale 1`, пустые — `#222` `opacity 0.1 scale 0.8`; фон
`bgColor` (`#000`).

## Входные данные

`BlocksPreloaderProps`: `rows?` (4); `cols?` (6); `color?` (`'#fff'`);
`bgColor?` (`'#000'`); `className?`. Прогресс — из `usePreloader()`
(`PreloaderProvider`).

## Анимации

`filled = floor(progress/100 * total)`; переход блока — motion 0.2 с
(`opacity`, `scale`, `backgroundColor`).

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/transitions/preloader.tsx` — компонент

## Зависимости

`framer-motion`, `react` (context), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `progress` передать как функцию кадра (без провайдера);
для блока `i` момент заполнения `f_i = (i/total)*L`,
`p = interpolate(frame, [f_i, f_i + 0.2*fps], [0,1], {clamp})` →
`opacity 0.1 + 0.9p`, `scale(0.8 + 0.2p)`,
`backgroundColor: interpolateColors(p, [0,1], ['#222', color])`.

## Паттерны

`quantities`, `growth-decline`, `sequence-steps`
