# Topography — `react-bits/topography`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Рельеф местности из светящихся контурных линий в наклонной 3D-перспективе
с туманом и глубиной резкости; ландшафт плывёт вперёд.

## Когда использовать

Исследование, карта рынка, «ландшафт отрасли», путь, данные о местности.

## Фразы из озвучки

- «изучим ландшафт рынка»
- «впереди — новые вершины»
- «карта возможностей»

## Визуальный стиль

Синие контуры (`#4f7cff`), 22 линии, наклон 32°, туман 0.35.

## Входные данные

Из usage: `color = '#4f7cff'`, `lineCount = 22`, `lineWidth = 1.2`,
`elevation = 1`, `foreground = 0.2`, `tilt = 32`, `speed = 0.25`,
`direction = 'forward'`, `glow = 0.6`, `depthOfField = 0.4`, `fog = 0.35`,
`hoverEffect = 'lift'`, `clickEffect = 'pulse'`.

## Анимации

WebGL2 (импортов нет; `FOV = 0.32`), движение рельефа по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Topography/Topography.jsx` (+ `Topography.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Topography/Topography.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/TopographyDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; hover/click-эффекты выключить.

## Паттерны

`spatial`, `growth-decline`
