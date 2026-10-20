# Grid Stagger Reveal (bit) — `remotion-bits/bit-grid-stagger`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Сетка 4×4 пронумерованных скруглённых квадратов, вырастающих (scale 0→1 +
fade) волной от центра к краям.

## Когда использовать

Каталог из многих однотипных элементов: функции, интеграции, команда,
16 городов; «их много, и все важны». Для упорядоченного перечисления —
`bit-list-reveal`; для драматичной сборки — `bit-fracture-reassemble`.

## Фразы из озвучки

- «шестнадцать интеграций из коробки»
- «всё под рукой, в одной сетке»
- «у нас целая экосистема модулей»

## Визуальный стиль

Фон `#09090b`, плитки `--color-primary` с `cornerShape: squircle`, белые
полупрозрачные цифры, лёгкая тень; пружинистый темп, 90 кадров, 1080×1080.

## Входные данные

Без props: `cols = rows = 4`, `gap = 20`, `padding = 60`; размер плитки
считается из `useViewportRect()` (width/height). Содержимое — номер
`i + 1`.

## Анимации

Один `StaggeredMotion` на всю сетку: `scale: [0, 1]`, `opacity: [0, 1]`,
`frames: [0, 45]`, `stagger: 3`, `staggerDirection: "center"` (по индексу,
не по 2D-расстоянию), `easing: "spring"`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/GridStagger.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/grid-stagger.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `useViewportRect`.

## Совместимость и адаптация

`native`. Заменить цифры на иконки/логотипы; задать `--color-primary`.
`cornerShape` — нестандартное CSS-свойство, в Chrome рендера может
игнорироваться (останется обычный радиус). `center` считает расстояние
по линейному индексу — для настоящей радиальной волны задать delay из
(row, col) вручную.

## Паттерны

`quantities`, `system-structure`, `sequence-steps`
