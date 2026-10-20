# LineWaves — `react-bits/line-waves`

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

Десятки тонких линий под углом, искривлённых волнами с подсветкой гребней
(до трёх цветов), — топографическая/звуковая абстракция.

## Когда использовать

Тонкий минималистичный фон: звук, данные, стратегия, «волны рынка».

## Фразы из озвучки

- «рынок колеблется»
- «тонкая грань между успехом и провалом»
- «каждая линия — отдельная история»

## Визуальный стиль

Белые линии (`color1..3 = '#ffffff'`), 72 линии толщиной 1.3, наклон -33°.

## Входные данные

Из usage: `color1`, `color2`, `color3` (`'#ffffff'`), `speed = 0.3`,
`lineCount = 72`, `lineWidth = 1.3`, `highlight = 1`, `warpIntensity = 1`,
`rotation = -33`, `enableMouseInteraction = true`.

## Анимации

WebGL2 (без библиотек), искривление линий по времени (rAF), курсор
деформирует.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LineWaves/LineWaves.jsx` (+ `LineWaves.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LineWaves/LineWaves.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LineWavesDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `enableMouseInteraction={false}`.

## Паттерны

`abstract-concepts`, `growth-decline`
