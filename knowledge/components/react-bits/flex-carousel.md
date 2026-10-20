# FlexCarousel — `react-bits/flex-carousel`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `raf`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Бесконечная лента изображений, которая проходит сквозь невидимую «жидкую
линзу» у краёв: картинки изгибаются, скручиваются и дают дисперсию цвета;
подписи, счётчик-барабан, интро-появление.

## Когда использовать

Модная галерея, лукбук, арт-портфолио; «вот подборка работ» с
эффектным стеклянным искажением.

## Фразы из озвучки

- «Новая коллекция сезона»
- «Посмотрите на работы наших авторов»
- «Каждый кадр — как через линзу»

## Визуальный стиль

Монохромные фото Unsplash по умолчанию, линза пресета `liquid`
(наклон 62°, изгиб 0.34, дисперсия 0.45); глянцевый fashion-стиль.

## Входные данные

`items` (`{src, alt, title}`), `preset='liquid'` (`liquid|ribbon|vortex|arch`),
`intro='rise'` (`rise|bloom|spin|deal|fade`), `cardHeight=0.5`, `gap=12`,
`radius=0`, `fit='natural'` (`natural|portrait|square|landscape`),
`lensWidth`, `lensHeight`, `tilt`, `roundness`, `bend`, `reach`, `curl`,
`dispersion`, `liquid`, `followCursor` (по умолчанию из пресета),
`squeeze=0.2`, `focusOnClick=true`, `autoplay=false`, `interval=4`,
`captions=true`, `captureWheel=true`, `onChange`, `onSelect`, `className`, `style`.

## Анимации

ogl-рендер в два прохода: карточки рисуются в RenderTarget, затем
фрагментный шейдер линзы (суперэллипс, изгиб, дисперсия по 12 отводам)
искажает сцену. Прокрутка — wheel/drag/autoplay, интро по `INTRO_DURATION`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/FlexCarousel/FlexCarousel.jsx` — компонент и шейдеры
- `templates/react-libriry/react-bits/src/content/Components/FlexCarousel/FlexCarousel.css` — подписи и UI
- `templates/react-libriry/react-bits/src/ts-default/Components/FlexCarousel/FlexCarousel.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/FlexCarouselDemo.jsx` — демо
- https://reactbits.dev/components/flex-carousel

## Зависимости

`ogl` (`Renderer`, `Program`, `Mesh`, `Triangle`, `Plane`, `Texture`, `RenderTarget`).

## Совместимость и адаптация

`complex`: WebGL-движок с собственным циклом. Рецепт: смещение ленты и
прогресс интро задавать от `frame/fps`, рендер ogl вызывать на каждый кадр
в эффекте, текстуры грузить под `delayRender`, картинки — `staticFile`.
Wheel/drag/hover убрать. Движок прочитан частично (шейдеры, props,
пресеты); детали цикла не разбирались.

## Паттерны

`transformation`, `sequence-steps`
