# ColorBends — `react-bits/color-bends`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Изогнутые цветные полосы-ленты, текущие и искривляющиеся по полю
искажения, с шумом и параллаксом; может быть прозрачным поверх контента.

## Когда использовать

Яркий современный фон для промо, бренда, музыкальных и креативных тем.

## Фразы из озвучки

- «яркие идеи меняют форму»
- «мир становится красочнее»
- «гибкость — наше главное качество»

## Визуальный стиль

Розовый/фиолетовый/бирюзовый (`#ff5c7a`, `#8a5cff`, `#00ffd1`), поворот 90°.

## Входные данные

Из usage: `colors`, `rotation = 90`, `speed = 0.2`, `scale = 1`,
`frequency = 1`, `warpStrength = 1`, `mouseInfluence = 1`, `noise = 0.15`,
`parallax = 0.5`, `iterations = 1`, `intensity = 1.5`, `bandWidth = 6`,
`transparent`.

## Анимации

three.js (`import * as THREE`) — полноэкранный шейдер, время в цикле
рендера; влияние курсора и параллакс.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/ColorBends/ColorBends.jsx` (+ `ColorBends.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/ColorBends/ColorBends.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/ColorBendsDemo.jsx`

## Зависимости

`three`

## Совместимость и адаптация

`complex`: рецепт R2 (uniform времени из кадра, `renderer.render` в эффекте
или порт шейдера в `ThreeCanvas`); `mouseInfluence = 0`, `parallax = 0`.

## Паттерны

`transformation`, `abstract-concepts`
