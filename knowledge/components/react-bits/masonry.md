# Masonry — `react-bits/masonry`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Masonry-галерея (Pinterest-сетка): плитки разной высоты по колонкам,
которые пружинисто влетают снизу/сверху/сбоку/от центра со stagger и
проявляются из размытия; подписи, hover-зум, lightbox.

## Когда использовать

Мудборд, портфолио, «посмотрите, сколько работ», витрина UGC, коллаж
скриншотов. Для ровной сетки карточек — `react-bits/chroma-grid` или
`react-bits/magic-bento`.

## Фразы из озвучки

- «Сотни работ наших пользователей»
- «Вот как выглядит наше портфолио»
- «Вдохновение на любой вкус»

## Визуальный стиль

Плитки с радиусом 12 и зазором 12, ширина колонки 240 (`columns='auto'`),
пружина 0.6 с с лёгким перелётом (`bounce=0.15`), blur-to-focus.

## Входные данные

`items=[]` (`{id, img, width, height, span, …}` — ключ `id`, пропорции из
`width/height`, иначе картинка `img` измеряется через `new Image()`, таймаут 2,5 с), `columns='auto'`,
`columnWidth=240`, `gap=12`, `radius=12`, `animateFrom='bottom'`
(`bottom|top|left|right|center|random|none`), `stagger=0.05`,
`duration=0.6`, `bounce=0.15`, `blurToFocus=true`, `revealOnScroll=true`,
`hoverEffect='zoom'` (`zoom|lift|tilt|none`), `focusOnHover=false`,
`captions='hover'` (`hover|always|none`), `parallax=0`, `lightbox=true`,
`draggable=true`, `onItemClick`, `onReorder`, `className`, `style`.

## Анимации

Раскладка — чистая функция `layoutOf(list, width, columns, columnWidth, gap, measured)`
(жадно в самую низкую колонку); позиции плиток ведут пружины в rAF, вход —
по появлению в зоне скролла; drag-перестановка с «призраками».

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/Masonry/Masonry.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/Masonry/Masonry.css` — стили, lightbox
- `templates/react-libriry/react-bits/src/ts-default/Components/Masonry/Masonry.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/MasonryDemo.jsx` — демо
- https://reactbits.dev/components/masonry

## Зависимости

`react-dom` (`createPortal` для lightbox), `@hugeicons/react`,
`@hugeicons/core-free-icons`.

## Совместимость и адаптация

`adaptable`: раскладка детерминирована, если у `items` заданы `width` и
`height` (тогда картинки не измеряются). Рецепт: посчитать `layoutOf` с
фиксированной шириной; плитка `i`:
`s = spring({frame: frame - i*stagger*fps, fps, config:{damping, stiffness}})`,
`translate = (1-s)*offset`, `reveal = clamp((frame - start_i)/(duration*fps))`,
`opacity = 1-(1-reveal)^3`, `blur = (1-opacity)*12px` (как в `paint()`). rAF-движок,
скролл-ревил, hover, drag, lightbox убрать; картинки — `Img` + `staticFile`.
Файл прочитан частично (раскладка, props, движок пружин; lightbox/drag — нет).

## Паттерны

`quantities`, `abstract-concepts`
