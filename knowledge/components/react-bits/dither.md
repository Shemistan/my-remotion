# Dither — `react-bits/dither`

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

Волны шума, отрисованные в стиле ретро-дизеринга: Bayer-матрицы, полутон,
штриховка, линии или шум, с ограниченной палитрой и крупным пикселем.

## Когда использовать

Ретро-компьютер, 1-bit/8-bit эстетика, «печать», минималистичный тех-фон.

## Фразы из озвучки

- «как на экране старого компьютера»
- «мы вернулись к основам»
- «простые пиксели — сложные идеи»

## Визуальный стиль

Серые волны (`waveColor = '#bcbcbc'`) на тёмном (`#120f17`), 4 цвета
палитры, пиксель 2.

## Входные данные

Из usage: `waveColor = '#bcbcbc'`, `backgroundColor = '#120f17'`,
`ditherMode = 'bayer'` (`bayer|bayer4|bayer2|halftone|lines|crosshatch|noise|none`),
`colorNum = 4`, `pixelSize = 2`, `waveSpeed = 0.05`, `waveFrequency = 3`,
`waveAmplitude = 0.3`, `mouseEffect = 'erase'` (`erase|reveal|ripple`),
`mouseRadius = 0.3`.

## Анимации

Сырой WebGL2, волны по времени (rAF), интро 1.8 с, след курсора до 16
точек, рябь 1.6 с.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Dither/Dither.jsx` (+ `Dither.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Dither/Dither.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/DitherDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; эффекты курсора выключить (параметр отключения —
см. PropTable демо; не сверено).

## Паттерны

`abstract-concepts`, `transformation`
