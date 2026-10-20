# PlasmaWave — `react-bits/plasma-wave`

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

Две изгибающиеся светящиеся плазменные волны-ленты с ярким ядром и
свечением, переходящие из одного цвета в другой.

## Когда использовать

Сигнал, звук, голос, связь двух сторон, «энергия перетекает».

## Фразы из озвучки

- «голос, который слышат миллионы»
- «энергия перетекает от идеи к результату»
- «сигнал усиливается»

## Визуальный стиль

Фиолетово-бирюзовый неон (`#A855F7`, `#06B6D4`) на тёмном.

## Входные данные

Из usage: `colors = ['#A855F7', '#06B6D4']`, `speed = 1`, `bend1 = 1`,
`bend2 = 0.5`, `thickness = 0.3`, `glow = 1`, `core = 0.6`,
`mouseInteraction = true`. Остальное — PropTable демо.

## Анимации

Сырой WebGL2, изгиб волн по времени (rAF), курсор влияет на изгиб.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/PlasmaWave/PlasmaWave.jsx` (+ `PlasmaWave.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/PlasmaWave/PlasmaWave.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/PlasmaWaveDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек (импортов нет).

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`.

## Паттерны

`relationships`, `abstract-concepts`
