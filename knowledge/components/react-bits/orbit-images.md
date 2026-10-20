# OrbitImages — `react-bits/orbit-images`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Картинки, плывущие по орбите-контуру (эллипс, круг, квадрат,
прямоугольник, треугольник, звезда, сердце, бесконечность, волна) с
эффектом глубины: спереди крупнее, сзади мельче и темнее; в центре —
произвольный контент.

## Когда использовать

Команда, клиенты, галерея моментов вокруг заголовка, «всё вращается
вокруг идеи». Автор — Dominik Koch.

## Фразы из озвучки

- «вокруг нашей идеи — люди»
- «все моменты вокруг одного события»
- «экосистема вокруг продукта»

## Визуальный стиль

Круглые миниатюры 90 px, видимый путь (`showPath`), наклон -8°.

## Входные данные

Из usage: `images`, `shape = 'ellipse'`, `radiusX = 340`, `radiusY = 80`,
`rotation = -8`, `duration = 30` (с на круг), `itemSize = 90`,
`depth = 0.6`, `showPath`, `centerContent`; в коде также `baseWidth`,
`hoverScale`, `intro`, `paused`, кривые `EASINGS`. Полный список —
PropTable демо.

## Анимации

SVG-путь → таблица 720 точек (`getPointAtLength`), позиции элементов
обновляются в rAF (CSS-трансформы); интро-разлёт, перетаскивание и hover.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/OrbitImages/OrbitImages.jsx` (+ `OrbitImages.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/OrbitImages/OrbitImages.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/OrbitImagesDemo.jsx`

## Зависимости

`react`; SVG + DOM.

## Совместимость и адаптация

`adaptable`: положение на орбите — `t = (frame / fps / duration + i / n) mod 1`
→ точка из LUT; rAF и drag убрать. В примере картинки с picsum.photos —
заменить на `staticFile`.

## Паттерны

`relationships`, `system-structure`
