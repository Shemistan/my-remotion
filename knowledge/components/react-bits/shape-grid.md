# ShapeGrid — `react-bits/shape-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Бесконечная сетка фигур (квадраты, плитки, шестиугольники, треугольники,
ромбы, круги, крестики, точки), медленно сдвигающаяся в заданном
направлении, с опциональным 3D-наклоном и туманом вдаль. Подсветка ячеек —
от курсора, клика (каскад), мерцания `twinkle` и волны интро.

## Когда использовать

Технологичный, «инженерный» фон: продукты, SaaS, данные, чертёж. Хорош под
текст. Не брать, когда нужна мягкая органика (`react-bits/silk`).

## Фразы из озвучки

- «всё построено на прочном фундаменте»
- «система, где каждый элемент на своём месте»
- «масштабируем на тысячи узлов»

## Визуальный стиль

Тонкие тёмные линии (`#2a2734`) на прозрачном фоне, светлые вспышки ячеек,
опционально радужные (`rainbow`). Перспектива через `tiltX/tiltY`.

## Входные данные

`shape = 'square'` (`square|tile|hexagon|triangle|diamond|circle|cross|dot`),
`cellSize = 40`, `lineWidth = 1`, `direction = 'diagonal'`
(`right|left|up|down|diagonal|none`), `speed = 0.5`, `lineColor = '#2a2734'`,
`hoverColor = '#ffffff'`, `hoverFillColor`, `fillOpacity = 0.15`,
`rainbow = false`, `tiltX = 0`, `tiltY = 0`, `radius = 1.5`, `trail = 0.6`,
`glow = 0.35`, `twinkle = 0`, `fade = 1`, `clickCascade = true`,
`intro = true`, `opacity = 1`, `backgroundColor = 'transparent'`,
`paused = false`, `dpr`, `className`, `style`.

## Анимации

Canvas 2D в rAF: `offset -= dir * speed * 60 * dt`, `time += dt`;
мерцание `sin(time·k + seed)` с детерминированным `hash(i, j)`; интро —
расходящаяся от центра волна подсветки.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/ShapeGrid/ShapeGrid.jsx` (+ `ShapeGrid.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/ShapeGrid/ShapeGrid.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/ShapeGridDemo.jsx`

## Зависимости

`react`; Canvas 2D.

## Совместимость и адаптация

`complex` (rAF), но переработка небольшая — рецепт R3: `time = frame/fps`,
`offset = dir * speed * 60 * time`, `draw()` из эффекта на кадр; подсветку
курсором убрать или задать программной «точкой» по кадру. `Math.random` нет.

## Паттерны

`system-structure`, `spatial`
