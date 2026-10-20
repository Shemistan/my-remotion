# Carousel — `react-bits/carousel`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Карусель карточек (текст + иконка или фото) в стеклянной рамке: пять
переходов — наклон в 3D (`tilt`), сдвиг, масштаб, затухание, поворот куба;
снизу точки, полоски-таймеры автоплея или счётчик «01 / 05».

## Когда использовать

Тур по фичам, «пять причин», слайды-истории, галерея кейсов, когда пункты
показываются по одному. Для веера фото — `react-bits/bounce-cards`, для
стопки с перекладыванием — `react-bits/card-swap`.

## Фразы из озвучки

- «Пройдёмся по ключевым возможностям одну за другой»
- «Следующий слайд — интеграции»
- «Вот пять шагов к запуску»

## Визуальный стиль

Тёмная (или светлая `theme='light'`) скруглённая рамка, плитки с мягкими
тенями, ширина 300 px, соотношение 1.25; спокойная пружина (stiffness 150,
damping 24).

## Входные данные

`items` (по умолчанию 5 карточек `{id,title,description,icon}`; элемент может
быть строкой-URL, `{image,alt,icon,title,description}` или React-узлом),
`baseWidth=300`, `aspectRatio=1.25`, `peek=0`, `gap=16`, `radius=12`,
`frame=true`, `effect='tilt'` (`tilt|slide|scale|fade|cube`),
`indicator='dots'` (`dots|bars|counter|none`), `arrows=false`,
`autoplay=false`, `autoplayDelay=3000`, `pauseOnHover=false`, `loop=false`,
`draggable=true`, `round=false`, `initialIndex=0`, `theme='dark'`,
`onChange`, `className`, `style`.

## Анимации

rAF интегрирует пружину позиции `p` к целевому индексу; каждая карточка
получает `transform/opacity/zIndex` от чистой функции `pose(index, p, settings)`;
автоплей копит `elapsed` и заполняет полоску `scaleX`; счётчик — WAAPI.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/Carousel/Carousel.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/Carousel/Carousel.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/Carousel/Carousel.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/CarouselDemo.jsx` — демо
- https://reactbits.dev/components/carousel

## Зависимости

`@hugeicons/react`, `@hugeicons/core-free-icons` (иконки по умолчанию).

## Совместимость и адаптация

`adaptable`: геометрия кадра — чистая `pose()`. Рецепт: `slide = autoplayDelay/1000*fps`,
`k = floor(frame/slide)`, `p = k - 1 + spring({frame: frame % slide, fps, config:{stiffness:150, damping:24}})`
(или `interpolate`), применять `pose(i, p, settings)` к слайдам в рендере;
полоска таймера `scaleX = (frame % slide)/slide`. Удалить rAF-движок,
`ResizeObserver` (задать ширину явно), `IntersectionObserver`, drag/wheel/keyboard.
Картинки — через `staticFile` + `Img`.

## Паттерны

`sequence-steps`, `comparison`
