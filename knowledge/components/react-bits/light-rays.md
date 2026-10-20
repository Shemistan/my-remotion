# LightRays — `react-bits/light-rays`

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

Объёмные лучи света из точки за краем кадра (8 положений: углы, центры
сторон), с дымкой и мерцанием; источник может следовать за курсором.

## Когда использовать

Откровение, надежда, «свет на проблему», божественный луч на продукт.

## Фразы из озвучки

- «пролить свет на проблему»
- «вот оно — решение»
- «новый день начинается»

## Визуальный стиль

Белые лучи (`raysColor = '#ffffff'`), мягкая дымка `haze = 0.25`.

## Входные данные

Из usage: `raysOrigin = 'top-center'` (`top-left|top-center|top-right|left|right|bottom-left|bottom-center|bottom-right`),
`raysColor = '#ffffff'`, `raysSpeed = 1`, `lightSpread = 0.5`,
`rayLength = 3`, `glow = 0.6`, `haze = 0.25`, `followMouse`,
`mouseInfluence = 0.1`. Остальное — PropTable демо.

## Анимации

Сырой WebGL2 (fullscreen-треугольник), время в rAF, до 4 «пульсов».

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LightRays/LightRays.jsx` (+ `LightRays.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LightRays/LightRays.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LightRaysDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `followMouse={false}`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
