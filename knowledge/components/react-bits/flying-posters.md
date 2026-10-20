# FlyingPosters — `react-bits/flying-posters`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Бесконечная колонка (или несколько колонок) 3D-постеров, которые при
движении вверх/вниз закручиваются и переворачиваются вокруг оси с изгибом
плоскости; соседние колонки могут ехать навстречу.

## Когда использовать

Афиша, каталог фильмов/обложек, портфолио «пролетает мимо», динамичное
интро с изображениями.

## Фразы из озвучки

- «Сотни обложек пролетают перед глазами»
- «Вся наша афиша в одном кадре»
- «Листаем каталог с бешеной скоростью»

## Визуальный стиль

Плоскости 320×320, переворот на 180° (`rotation`) с квинтик-easing и
изгибом `distortion=3`; опционально затенение граней и затухание к краям;
кинематографично.

## Входные данные

`items` (строки или `{image}`), `planeWidth=320`, `planeHeight=320`,
`distortion=3`, `scrollEase=0.01`, `cameraFov=45`, `cameraZ=20`, `gap`,
`columns=1`, `columnGap=40`, `alternate=true`, `radius=0`, `rotation=180`,
`axis='vertical'` (`vertical|horizontal|diagonal`), `speed=0` (автопрокрутка),
`lean=0`, `fade=0`, `shading=0`, `wheel=true`, `drag=true`, `pageScroll=0`,
`onItemClick`, `className`, `style`.

## Анимации

WebGL2: вершинный шейдер берёт `uScroll`, сдвигает постер по циклу `uLoop`
и поворачивает его на `qinticInOut(progress)*uRotation` по положению на
экране; `uScroll` копится от колеса, drag, скролла страницы или `speed`,
со сглаживанием `scrollEase`. Изображения собираются в текстурный атлас.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/FlyingPosters/FlyingPosters.jsx` — компонент и шейдеры
- `templates/react-libriry/react-bits/src/content/Components/FlyingPosters/FlyingPosters.css` — стили
- `templates/react-libriry/react-bits/src/ts-default/Components/FlyingPosters/FlyingPosters.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/FlyingPostersDemo.jsx` — демо
- https://reactbits.dev/components/flying-posters

## Зависимости

Нет npm-пакетов: чистый WebGL2.

## Совместимость и адаптация

`complex`: WebGL-цикл и асинхронная сборка атласа. Рецепт: `uScroll` задавать
от кадра (`speed * frame / fps` или `interpolate` по сценарию), `draw` — в
эффекте на каждый кадр, загрузку изображений в атлас — под
`delayRender/continueRender`, картинки через `staticFile`. Wheel/drag/scroll
убрать. Нужен рендер с GL; альтернатива — воспроизвести на `@remotion/three`.
Часть файла (загрузка атласа, обработчики) просмотрена бегло.

## Паттерны

`timeline`, `spatial`
