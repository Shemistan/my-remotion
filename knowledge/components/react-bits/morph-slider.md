# MorphSlider — `react-bits/morph-slider`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `engine:other`, `engine:gsap`, `raf`, `timers`, `dom`, `user-events`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Полноэкранный слайдер изображений, где смена кадра — шейдерный переход:
картинка «плавится» (melt), идёт рябью (ripple), сдвигается срезами (shear)
или закручивается (swirl), с хроматической аберрацией и дрейфом.

## Когда использовать

Переход между фото/сценами, «до и после», смена локаций, эффектное
листание обложек. Как переход между сценами Remotion — после переноса шейдера.

## Фразы из озвучки

- «А теперь перенесёмся в другое место»
- «Было — стало»
- «Одна эпоха плавно перетекает в другую»

## Визуальный стиль

Скругление 16px, тёмная подложка, подписи и стрелки; переход 1,1 с
`power2.inOut`, интенсивность 0.55, аберрация 0.35; художественный.

## Входные данные

`items` (`{image, caption}`; по умолчанию Unsplash), `startIndex=0`,
`transition='melt'` (`melt|ripple|shear|swirl`), `duration=1.1`,
`ease='power2.inOut'`, `intensity=0.55`, `scale=2.4`, `aberration=0.35`,
`drift=0.4`, `autoplay=false`, `autoplayDelay=4` (с), `loop=true`,
`radius=16`, `overlayColor='#000000'`, `showCaptions=true`,
`showControls=true`, `showIndicators=true`, `className`, `...props`.

## Анимации

`MorphEngine` на ogl: фрагментный шейдер смешивает `tCurrent` и `tNext` по
`uProgress` (0→1), режим `uMode`; `uProgress` анимирует `gsap.to`, `uTime` —
rAF; автоплей — `setTimeout`; drag тянет прогресс пальцем.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/MorphSlider/MorphSlider.jsx` — компонент, движок, шейдер
- `templates/react-libriry/react-bits/src/content/Components/MorphSlider/MorphSlider.css` — UI слайдера
- `templates/react-libriry/react-bits/src/ts-default/Components/MorphSlider/MorphSlider.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/MorphSliderDemo.jsx` — демо
- https://reactbits.dev/components/morph-slider

## Зависимости

`ogl` (`Renderer`, `Triangle`, `Program`, `Mesh`, `Texture`), `gsap`.

## Совместимость и адаптация

`complex`: WebGL-движок и GSAP-твины. Рецепт: оставить шейдер, а
`uProgress = interpolate(frame - switchFrame, [0, duration*fps], [0, 1], easing)`
и `uTime = frame/fps` задавать в эффекте на каждый кадр с `renderer.render`;
текстуры грузить под `delayRender`, картинки — `staticFile`. Таймеры, drag,
стрелки убрать. Внутренности движка (resize, загрузка) прочитаны частично.

## Паттерны

`transformation`, `comparison`
