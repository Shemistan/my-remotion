# FlickeringGrid — `magicui/flickering-grid`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Поле мелких квадратиков, которые случайно вспыхивают и гаснут с
разной прозрачностью — «мерцающая матрица», похоже на светодиодное
табло или шум данных.

## Когда использовать

Фон для тем данных, сигналов, «система живёт», заставки в стиле
дашборда. Для статичного фона — `dot-pattern`.

## Фразы из озвучки

- «данные идут непрерывным потоком»
- «система работает круглосуточно»
- «каждый сигнал на счету»

## Визуальный стиль

Квадраты 4 px, зазор 6 px, цвет `rgb(0,0,0)` до `maxOpacity 0.3`;
нервный мелкий ритм.

## Входные данные

- `squareSize?` = `4`, `gridGap?` = `6`, `flickerChance?` = `0.3`
- `color?` = `"rgb(0, 0, 0)"` (конвертируется в rgba через 1×1 canvas)
- `width?`, `height?` (иначе размер контейнера), `maxOpacity?` = `0.3`
- `className?`, атрибуты `div`.

## Анимации

Canvas 2D: `Float32Array` прозрачностей; цикл
`requestAnimationFrame`, каждая клетка с вероятностью
`flickerChance·dt` получает `Math.random()·maxOpacity`; рисование
`fillRect`. Запускается только при видимости (`IntersectionObserver`),
размер — `ResizeObserver`, `devicePixelRatio`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/flickering-grid.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/flickering-grid.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`complex`: накапливаемое случайное состояние в rAF. Переписать на
кадр: прозрачность клетки `i` на кадре `f` = `random(\`${i}-${floor(f/k)}\`)
· maxOpacity`, где `k` — «период мерцания» в кадрах (разный для клеток
через `random(i)`); рисовать в `useEffect([frame])` на canvas (или SVG
`rect`), убрать observers, размер — из `useVideoConfig()`.

## Паттерны

`abstract-concepts`, `quantities`
