# Radar — `react-bits/radar`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Экран радара: концентрические кольца, спицы, вращающийся луч развёртки со
шлейфом, вспыхивающие цели и «шум» помех.

## Когда использовать

Поиск, мониторинг, обнаружение возможностей, «цель захвачена», кибербез.

## Фразы из озвучки

- «мы видим каждую возможность»
- «цель обнаружена»
- «держим рынок под наблюдением»

## Визуальный стиль

Зелёный фосфор (`#3ef09a`) на тёмном, 6 колец, 12 спиц.

## Входные данные

Из usage: `color = '#3ef09a'`, `mode = 'sweep'`, `speed = 1`,
`trail = 0.35`, `scale = 0.9`, `ringCount = 6`, `spokeCount = 12`,
`targets = 6`, `clutter = 0.35`, `mouseInteraction = true`.

## Анимации

WebGL2 (fullscreen-квад, камерный шейдер), вращение луча по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Radar/Radar.jsx` (+ `Radar.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Radar/Radar.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/RadarDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`. Простой вариант —
повторить на SVG (`conic-gradient` + `rotate(frame*k)`).

## Паттерны

`spatial`, `key-point-emphasis`
