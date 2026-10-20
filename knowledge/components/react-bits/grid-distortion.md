# GridDistortion — `react-bits/grid-distortion`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Картинка, натянутая на сетку `grid × grid`, которая деформируется
(тянется, расходится рябью), а затем упруго возвращается; есть фоновое
«дыхание» `idle` и интро.

## Когда использовать

Живое фото/обложка на фоне: «реальность искажается», «пространство
меняется», мягкий акцент на изображении. Без указателя видны только
`idle`-колыхание и интро.

## Фразы из озвучки

- «реальность начинает плыть»
- «привычная картина мира искажается»
- «посмотрите на это под другим углом»

## Визуальный стиль

Фотография (`imageSrc`), лёгкая хроматическая аберрация (`chroma`),
квадратные ячейки искажения.

## Входные данные

Из usage: `imageSrc = '/assets/demo/night-landscape.webp'`, `grid = 15`,
`radius = 0.18`, `strength = 0.15`, `relaxation = 0.96`, `mode = 'drag'`,
`softness = 0`, `chroma = 0`, `idle = 0.3`, `clickRipple = true`,
`intro = true`. Остальное — PropTable демо.

## Анимации

WebGL2: смещения ячеек в текстуре, затухание `relaxation` каждый кадр
(rAF), idle-шум, рябь от клика.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/GridDistortion/GridDistortion.jsx` (+ `GridDistortion.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/GridDistortion/GridDistortion.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/GridDistortionDemo.jsx`

## Зависимости

`react`; сырой WebGL2; картинка грузится в текстуру асинхронно.

## Совместимость и адаптация

`complex`: рецепт R1; картинка — `staticFile` + `delayRender` до загрузки
текстуры; затухание `relaxation` накопительное (R3), без указателя
оставить только `idle`.

## Паттерны

`transformation`, `abstract-concepts`
