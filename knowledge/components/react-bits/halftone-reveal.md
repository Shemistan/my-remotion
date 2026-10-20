# HalftoneReveal — `react-bits/halftone-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Фото в виде газетного полутона (точки, линии, эллипсы; моно, дуотон или
цвет), под которым в круге «проявляется» оригинал; `wander` водит круг
сам, есть интро.

## Когда использовать

Пресса, газета, «за кадром истории», ретро-печать; раскрытие фото.

## Фразы из озвучки

- «об этом писали все газеты»
- «присмотритесь — за картинкой стоит реальность»
- «история из архива»

## Визуальный стиль

Пресеты `newsprint`, `riso`, `process`, `engraving`, `pop`, `grit`;
чернила `#120f17` на белой бумаге.

## Входные данные

Из демо: `src` (по умолчанию внешний URL unsplash — `DEFAULT_SRC`),
`mode = 'mono'`, `shape = 'dot'`, `cellSize = 6`, `angle = 45`,
`dotScale = 1`, `contrast = 1.1`, `brightness = 0`, `invert = false`,
`roughness = 0`, `misregistration = 0`, `fit = 'contain'`,
`inkColor = '#120f17'`, `accentColor`, `paperColor = '#ffffff'`,
`revealRadius = 160`, `softness = 0.6`, `linger = 1.2`, `reverse = false`,
`wander = false`, `clickBurst = true`, `intro = true`.

## Анимации

WebGL2-шейдер полутона, круг проявления за курсором или `wander`,
затухание `linger`, rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/HalftoneReveal/HalftoneReveal.jsx` (+ `HalftoneReveal.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/HalftoneReveal/HalftoneReveal.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/HalftoneRevealDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; `src` — локальный `staticFile` (дефолт тянет
внешний URL) + `delayRender`; круг проявления задать траекторией от кадра
или `wander`; `linger` накопительный — R3.

## Паттерны

`comparison`, `transformation`
