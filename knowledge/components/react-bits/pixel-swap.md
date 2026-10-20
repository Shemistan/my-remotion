# PixelSwap — `react-bits/pixel-swap`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | complex |
| Флаги | `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Смена одного содержимого другим волной пикселей: блоки вырастают с
отскоком, поворотом и скруглением в порядке `random`, `center`, `edges`,
`left-to-right`…, `diagonal`, `spiral`.

## Когда использовать

До/после, смена слайда/картинки, «трансформация продукта». `trigger =
'none'` + `active` дают программное управление.

## Фразы из озвучки

- «и всё меняется за секунду»
- «новая версия — пиксель за пикселем»
- «смотрите, как это выглядело раньше»

## Визуальный стиль

Блоки 48 px; пресеты `pixels`, `dots`, `spin`, `scatter`, `blocks`.

## Входные данные

`firstContent`, `secondContent`, `pattern = 'pointer'`, `pixelSize = 48`,
`gap = 0`, `pixelRadius = 0`, `pixelScale = 0`, `pixelSpin = 0`,
`duration = 400` (мс), `pixelDuration = 350` (мс), `randomness = 0.2`,
`bounce = 0.3`, `trigger = 'hover'` (`hover|click|none`), `intro = true`,
`initialActive = false`, `active`, `onActiveChange`.

## Анимации

Симуляция волны с фиксированным шагом `STEP = 1/240` в цикле анимации,
до 600 пикселей (`MAX_PIXELS`); способ отрисовки пикселей построчно не
сверен.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/PixelSwap/PixelSwap.jsx` (+ `PixelSwap.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/PixelSwap/PixelSwap.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/PixelSwapDemo.jsx`

## Зависимости

`react`

## Совместимость и адаптация

`complex`: `pattern = 'pointer'` заменить на направленный (`left-to-right`
и т.п.), `trigger = 'none'`; прогресс волны вычислять из кадра (R3) вместо
шагов симуляции.

## Паттерны

`comparison`, `transformation`
