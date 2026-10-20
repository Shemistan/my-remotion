# InfiniteSpiral — `react-bits/infinite-spiral`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Бесконечная 3D-спираль (спираль ДНК) из карточек-изображений: карточки
поднимаются по винтовой линии, центральные крупнее, к краям плавно гаснут и
размываются.

## Когда использовать

Поток контента, бесконечная лента идей/работ, «эволюция», каталог или
портфолио в движении, фон для заголовка.

## Фразы из озвучки

- «Бесконечный поток идей»
- «Сотни проектов — и каждый уникален»
- «Наша история продолжается»

## Визуальный стиль

Квадратные карточки 100×100, радиус 10px, 7 карточек на виток, радиус
спирали 170px, перспектива 1000; спокойное техно-портфолио.

## Входные данные

`items` (строки или `{src, alt, href, target, label, id}`), `speed=0.55`,
`direction='up'` (`up|down`), `animationMode='auto'` (`auto|scroll|drag|all`),
`radius=170`, `cardWidth=100`, `cardHeight=100`, `verticalSpacing=60`,
`perspective=1000`, `cardsPerTurn=7`, `rotation=0`, `cardTilt=0`,
`cardRadius=10`, `centerScale=1.2`, `edgeFade=0.3`, `edgeBlur=6`,
`pauseOnHover=true`, `imageFit='cover'`, `grayscale=0`, `className`.

## Анимации

rAF: `progress += speed*dt` (со сглаживанием скорости), затем для карточки
`offset = mod(i - progress + n/2, n) - n/2`, угол `offset*360/cardsPerTurn`,
`x = sin(angle)*R`, `z = cos(angle)*R`, `y = offset*verticalSpacing`,
масштаб/opacity/blur от `offset` — чистая функция прогресса.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/InfiniteSpiral/InfiniteSpiral.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/InfiniteSpiral/InfiniteSpiral.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/InfiniteSpiral/InfiniteSpiral.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/InfiniteSpiralDemo.jsx` — демо
- https://reactbits.dev/components/infinite-spiral

## Зависимости

Нет внешних пакетов (React + CSS 3D).

## Совместимость и адаптация

`adaptable`: `progress = speed * dir * frame / fps`, расчёт `transform`,
`opacity`, `filter: blur`, `zIndex` перенести из rAF в рендер (inline-style).
Scroll/drag/hover и `IntersectionObserver` убрать; `loading='lazy'` у `img`
заменить на `Img` из remotion со `staticFile`, размеры контейнера — из
`useVideoConfig` вместо `getBoundingClientRect`.

## Паттерны

`timeline`, `abstract-concepts`
