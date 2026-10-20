# RippleGrid — `react-bits/ripple-grid`

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

Сетка (линии, точки или кресты), по которой расходятся кольцевые волны —
автоматически из центра (`autoRipple = 'center'`) или от кликов (до 12).

## Когда использовать

Распространение сигнала/влияния, «эффект домино», запуск, радиоволны.

## Фразы из озвучки

- «одно решение — и волны расходятся по всей системе»
- «влияние распространяется»
- «сигнал дошёл до каждого»

## Визуальный стиль

Белые линии сетки (`color = '#ffffff'`), ячейка 48 px, светлые гребни волн.

## Входные данные

Из usage: `color = '#ffffff'`, `cellSize = 48`, `rippleStrength = 1`,
`autoRipple = 'center'`; варианты сетки `VARIANTS = lines|dots|cross`.
Остальное — PropTable демо.

## Анимации

Сырой WebGL2: волны с временем старта и центром в uniform-массиве, rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/RippleGrid/RippleGrid.jsx` (+ `RippleGrid.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/RippleGrid/RippleGrid.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/RippleGridDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; волны задавать списком моментов (кадров) старта —
удобно синхронизировать с озвучкой.

## Паттерны

`cause-effect`, `system-structure`
