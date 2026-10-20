# GradientBlinds — `react-bits/gradient-blinds`

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

Градиент, разрезанный на наклонные «жалюзи» с рельефом, блеском и шумом;
полосы слегка покачиваются (`sway`), у курсора — прожектор и наклон.

## Когда использовать

Стильный корпоративный/дизайнерский фон под заголовок, «открываем шторы».

## Фразы из озвучки

- «приоткроем завесу»
- «новый взгляд на привычное»
- «стиль в каждой детали»

## Визуальный стиль

Розово-фиолетовый градиент (`#FF9FFC` → `#5227FF`), 16 полос под 20°.

## Входные данные

Из usage: `gradientColors = ['#FF9FFC', '#5227FF']`, `angle = 20`,
`blindCount = 16`, `blindMinWidth = 60`, `spotlightRadius = 0.5`,
`shine = 0.4`, `relief = 0.5`, `glow = 0.4`, `sway = 0.35`,
`hoverTilt = 0.6`, `clickEffect = 'ripple'`, `noise = 0.3`. До 8 цветов.

## Анимации

WebGL2-шейдер: покачивание полос по времени (rAF), интро 1.8 с, рябь от
клика 1.6 с (до 4 волн), прожектор у курсора.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GradientBlinds/GradientBlinds.jsx` (+ `GradientBlinds.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GradientBlinds/GradientBlinds.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GradientBlindsDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1; `hoverTilt = 0`, `spotlightRadius = 0` (или
прожектор по траектории от кадра), клики выключить.

## Паттерны

`abstract-concepts`, `transformation`
