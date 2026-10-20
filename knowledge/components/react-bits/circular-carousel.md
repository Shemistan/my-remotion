# CircularCarousel — `react-bits/circular-carousel`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

3D-кольцо изображений на CSS-трансформах: цилиндр с изогнутыми карточками,
«орбита» с карточками лицом к зрителю, вертикальное «колесо» или панорама
изнутри; кольцо дрейфует или шагает, с интро-сборкой и затуханием по глубине.

## Когда использовать

Галерея работ/продуктов по кругу, «всё многообразие», круговорот,
интро-сцена с фото. Для линейного рельса в глубину — `react-bits/depth-carousel`.

## Фразы из озвучки

- «Весь наш каталог — по кругу»
- «От пейзажей до портретов»
- «Мир вращается вокруг ваших идей»

## Визуальный стиль

Карточки 220px (aspect 1), gap 25, радиус 12, по умолчанию ч/б фото
Unsplash, затухание в `#000000`, пресет `cylinder` (наклон −5°, перспектива 2500).

## Входные данные

`items` (`{src, alt, title, subtitle}`), `preset='cylinder'`
(`cylinder|orbit|wheel|panorama`), `intro='rise'` (`assemble|rise|spin|none`),
`cardWidth=220`, `aspectRatio=1`, `gap=25`, `curve`, `tilt`, `perspective`,
`autoplay='drift'`, `speed=14`, `interval=3`, `direction='left'`,
`draggable=true`, `momentum=0.6`, `snap=true`, `pauseOnHover=true`,
`focusOnClick=true`, `parallax=0.3`, `stretch=0.5`, `depthFade=0.55`,
`fadeColor='#000000'`, `innerShade=0.6`, `cornerRadius=12`, `captions=false`,
`onChange`, `onItemClick`, `className`, `style`.

## Анимации

rAF ведёт угол кольца (`state.angle`): дрейф со скоростью `speed`, шаги по
`interval` либо инерция от drag; интро длиной 1,4–1,8 с; карточки при
`curve>0` собраны из 8 тайлов для изгиба; изображения предзагружаются
`Promise` (таймаут 2,4 с) до старта.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/CircularCarousel/CircularCarousel.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/CircularCarousel/CircularCarousel.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/CircularCarousel/CircularCarousel.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/CircularCarouselDemo.jsx` — демо
- https://reactbits.dev/components/circular-carousel

## Зависимости

Нет внешних пакетов (React + CSS 3D).

## Совместимость и адаптация

`adaptable` в режиме `autoplay='drift'`: угол = функция времени. Рецепт:
`angle = dir * speed * frame / fps` (единицы `speed` в коде drift не
проверены — сверить на рендере) и вызвать логику `render(s, now)` (она чистая:
`ring.rotateY(angle)`, `rotateY(base) translateZ(R)` у карточек,
`--cc-depth` от `cos`) в JSX; интро — `elapsed = frame/fps*1000`. Режим
`step` — `target` по `floor(frame/(interval*fps))` + `spring()`. Предзагрузку
картинок обернуть `delayRender`, фото — `staticFile`. Drag, инерцию, hover убрать.

## Паттерны

`spatial`, `abstract-concepts`
