# Element3D — `remotion-bits/element-3d`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Произвольный HTML-контент, размещённый в 3D-пространстве `Scene3D`
(позиция, поворот, масштаб) вне шагов: декорации, плавающие карточки,
объекты, мимо которых пролетает камера. С `fixed` элемент «приклеен» к
камере (HUD: подписи, логотип, счётчик поверх облёта).

## Когда использовать

Нужно населить 3D-сцену объектами, которые видны с нескольких шагов, или
держать заголовок на экране, пока камера движется. Работает только внутри
`Scene3D` (`useCamera` бросает ошибку вне его).

## Фразы из озвучки

- «вокруг нас — десятки сервисов»
- «пока мы движемся, счёт продолжает расти»
- «каждая карточка — отдельный клиент»

## Визуальный стиль

Абсолютно позиционированный `div` с `matrix3d`, `preserve-3d`; внешний вид —
целиком от детей.

## Входные данные

`Element3DProps`: `x y z scale scaleX scaleY rotateX rotateY rotateZ`
(AnimatedValue; используется конечное значение), `rotateOrder?` ("xyz"),
`fixed?` (false), `centered?` (false, добавляет `translate(-50%,-50%)`),
`transition?` (Transform+Visual+Timing + `stagger`, `staggerDirection`),
`className?`, `style?`, `children`. `scaleZ` в типах есть, но компонентом
не читается.

## Анимации

Переход входа через `useMotionTiming`/`buildMotionStyles`; при `stagger` —
по детям с направлением forward/reverse/center/random (детерминированная
перестановка). При `fixed` — матрица камеры × матрица элемента на каждом кадре.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/Scene3D/Element3D.tsx` — компонент
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/element3d.mdx` — справка
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/scene-3d/3DElements.tsx` — пример

## Зависимости

`remotion` (`random`), `three` (математика), внутренние `Scene3D/context`,
`utils/motion`, `utils/transform3d`, `utils/interpolate3d`.

## Совместимость и адаптация

`native`. Переход `transition` без `frames` отсчитывается от начала
композиции (Element3D не даёт StepTimingContext) — задавать `delay`/`frames`
явно. Стиль перехода перезаписывает `transform` элемента, если переход
содержит трансформы.

## Паттерны

`spatial`, `system-structure`, `relationships`
