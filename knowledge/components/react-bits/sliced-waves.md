# SlicedWaves — `react-bits/sliced-waves`

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

Несколько волнистых лент-срезов (персик, розовый, синий) в перспективе,
размытые и светящиеся, в нижней части кадра (`position`).

## Когда использовать

Нежный градиентный фон для лендинг-подобного интро, лайфстайл, музыка.

## Фразы из озвучки

- «мягкий переход к главному»
- «три цвета — три идеи»
- «плавно и красиво»

## Визуальный стиль

`#ffd9a8`, `#ff5fa2`, `#5b8cff`; размытие 0.6, glow 1.

## Входные данные

Из usage: `color1 = '#ffd9a8'`, `color2 = '#ff5fa2'`, `color3 = '#5b8cff'`,
`ribbons = 3`, `spacing = 28`, `perspective = 0.45`, `blur = 0.6`,
`glow = 1`, `position = 0.78`, `mouseInteraction = true`.

## Анимации

GPU-шейдер (импортов нет), колыхание по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/SlicedWaves/SlicedWaves.jsx` (+ `SlicedWaves.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/SlicedWaves/SlicedWaves.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/SlicedWavesDemo.jsx`

## Зависимости

`react`; без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`.

## Паттерны

`abstract-concepts`, `comparison`
