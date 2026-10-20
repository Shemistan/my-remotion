# Threads — `react-bits/threads`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Пучок из десятков тонких светящихся нитей, волнообразно колышущихся под
углом, с расщеплением и «бахромой» на концах.

## Когда использовать

Связи, переплетение, тонкая работа, звук/волна; минималистичный фон
под крупный текст.

## Фразы из озвучки

- «всё переплетено»
- «тонкая настройка на каждом этапе»
- «нити ведут к одному решению»

## Визуальный стиль

Белые нити (`color = '#ffffff'`) на тёмном, сужение к концам (`taper`).

## Входные данные

Из usage: `color = '#ffffff'`, `lineCount = 90`, `thickness = 0.6`,
`softness = 1.3`, `amplitude = 1.7`, `distance = 0.4`, `waves = 1.05`,
`speed = 0.6`, `split = 0.04`, `fray = 0.5`, `angle = 25`, `taper = 0.85`,
`brightness = 1.4`, `parting = 0`, `enableMouseInteraction = true`,
`fade = 0`, `opacity = 1`.

## Анимации

Сырой WebGL2: вершинный шейдер линий с `uTime` (rAF); курсор раздвигает нити.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Threads/Threads.jsx` (+ `Threads.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Threads/Threads.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/ThreadsDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `enableMouseInteraction={false}`.

## Паттерны

`relationships`, `abstract-concepts`
