# Balatro — `react-bits/balatro`

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

Психоделический пиксельный водоворот из трёх цветов в стиле фона игры
Balatro: краска закручивается спиралью, крупный пиксель.

## Когда использовать

Игры, казино, ретро, «водоворот событий», яркие промо. Не для делового тона.

## Фразы из озвучки

- «нас затягивает в водоворот событий»
- «ставки растут»
- «игра начинается»

## Визуальный стиль

Красный/синий/тёмно-бирюзовый (`#DE443B`, `#006BB4`, `#162325`),
пикселизация `pixelSize`.

## Входные данные

Из usage: `color1 = '#DE443B'`, `color2 = '#006BB4'`, `color3 = '#162325'`,
`swirl = 0.25`, `pixelSize = 1.5`, `mouseInteraction`. Остальное —
PropTable демо.

## Анимации

Сырой WebGL2, закрутка по времени из rAF; курсор «размешивает» краску
(до 4 завихрений `MAX_TWIRLS`).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Balatro/Balatro.jsx` (+ `Balatro.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Balatro/Balatro.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/BalatroDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`.

## Паттерны

`transformation`, `abstract-concepts`
