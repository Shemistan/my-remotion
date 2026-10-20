# Beams — `react-bits/beams`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Наклонные полосы-лучи света (как свет сквозь жалюзи/прожекторы),
медленно плывущие, с мягким свечением.

## Когда использовать

Сцена, премьера, «в свете софитов», драматичный фон для заголовка.

## Фразы из озвучки

- «в центре внимания — наш продукт»
- «свет в конце туннеля»
- «и вот — премьера»

## Визуальный стиль

Белые лучи (`color = '#ffffff'`) на тёмном, наклон 30°, ширина 140 px.

## Входные данные

Из usage: `color = '#ffffff'`, `beamWidth = 140`, `rotation = 30`,
`speed = 1`, `glow = 0.6`. Остальное — PropTable демо.

## Анимации

Сырой WebGL2 (квад + шейдер), движение по времени в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Beams/Beams.jsx` (+ `Beams.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Beams/Beams.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/BeamsDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1. Интерактив в usage не заявлен (флаг `user-events`
не ставится; не сверено построчно).

## Паттерны

`key-point-emphasis`, `abstract-concepts`
