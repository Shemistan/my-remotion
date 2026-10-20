# MetaBalls — `react-bits/meta-balls`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

«Лава-лампа»: шарики, сливающиеся в липкие капли (сплошные, контуром или
изолиниями), орбитально движутся сами; дополнительный шар следует за
курсором.

## Когда использовать

Слияние, объединение команд/компаний, органичность, текучие идеи.

## Фразы из озвучки

- «две компании сливаются в одну»
- «идеи перетекают друг в друга»
- «мы объединяем усилия»

## Визуальный стиль

Белые капли (`#ffffff`) на прозрачном фоне; варианты `solid`, `outline`,
`contour`.

## Входные данные

Из usage: `color = '#ffffff'`, `cursorBallColor = '#ffffff'`,
`variant = 'solid'`, `motion = 'orbit'`, `ballCount = 15` (до 50),
`animationSize = 30`, `gooeyness = 0.5`, `stretch = 0.5`, `wobble = 0.5`,
`enableTransparency = true`.

## Анимации

WebGL2-шейдер метаболов, позиции шаров по времени (rAF), шар курсора.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/MetaBalls/MetaBalls.jsx` (+ `MetaBalls.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/MetaBalls/MetaBalls.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/MetaBallsDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; шар курсора убрать или вести по траектории от кадра.

## Паттерны

`relationships`, `transformation`
