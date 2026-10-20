# StatusMark — `react-bits/status-mark`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Значок статуса задачи с подписью: пунктирное кольцо (pending), вращающаяся
дуга или кольцо прогресса (running), которое морфит в галочку (done) или
крест (failed/cancelled); подпись может зачёркиваться.

## Когда использовать

Чек-листы задач агента, todo-список, «этап выполнен», пайплайн задач.
Набор из нескольких StatusMark = список шагов с прогрессом.

## Фразы из озвучки

- «первая задача выполнена»
- «осталось ещё два шага»
- «и вот всё готово»

## Визуальный стиль

Тонкая SVG-иконка 20 px, `currentColor`, зелёный/красный финал, текст 14 px.

## Входные данные

`status = 'pending'` (`pending|running|done|failed|cancelled`), `progress`
(0–1, делает running детерминированным), `label`, `color = 'currentColor'`,
`doneColor = '#22c55e'`, `errorColor = '#ef4444'`, `size = 20`,
`strokeWidth = 2`, `dashes = 8`, `fontSize = 14`, `spinDuration = 1100`,
`arcLength = 0.68`, `drawDuration = 240`, `fillOpacity = 0.06`,
`strike = true`, `strikeDelay = 60`, `className`, `style`.

## Анимации

`motion/react`: `useMotionValue` + `animate` (spring/ease) для режима,
дуги и вращения; `stroke-dasharray` пишется в SVG напрямую.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Micro/StatusMark/StatusMark.jsx` (+ `StatusMark.css`)
- `templates/react-libriry/react-bits/src/ts-default/Micro/StatusMark/StatusMark.tsx`
- `templates/react-libriry/react-bits/src/demo/Micro/StatusMarkDemo.jsx`

## Зависимости

`motion`

## Совместимость и адаптация

`adaptable`: рецепт R5 — значения `mode`, `arc`, `travel` вычислять из
кадра (`interpolate`/`spring`), вращение — `travel = frame * k`; SVG
и геометрия (`CHECK`, `CROSS`) остаются.

## Паттерны

`sequence-steps`, `timeline`
