# PixelTransition — `react-bits/pixel-transition`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `transitions-scene` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Карточка, где первое содержимое закрывается пикселями и открывается
второе: пиксели появляются случайно, по Bayer-дизеру, рябью или wipe,
формы square/rounded/circle, анимация pop/grow/fade.

## Когда использовать

«Было/стало», день/ночь, до/после, смена картинки в кадре. Управляется
prop `active`, поэтому переключение по кадру возможно.

## Фразы из озвучки

- «а теперь посмотрите, что получилось»
- «было — стало»
- «одно превращается в другое»

## Визуальный стиль

Белые пиксели (`pixelColor`), сетка 10; пресеты `classic`, `dither`,
`ripple`, `wipe`, `mosaic`.

## Входные данные

`firstContent`, `secondContent`, `gridSize = 10`, `pixelColor = '#ffffff'`,
`mosaic = 0`, `animationStepDuration = 0.4`, `pattern = 'random'`
(`random|dither|ripple|wipe`), `randomness = 0.3`, `pixelAnimation = 'pop'`
(`pop|grow|fade`), `pixelShape = 'square'` (`square|rounded|circle`),
`gap = 0`, `fps = 0`, `trigger = 'hover'` (`hover|click`), `active`,
`onActiveChange`, `once = false`, `aspectRatio`.

## Анимации

Canvas 2D: `draw()` — чистая функция от `state.progress` (0→0.5 покрытие,
0.5→1 раскрытие), задержки ячеек из детерминированного `hash(col, row,
seed)`; прогресс двигается в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/PixelTransition/PixelTransition.jsx` (+ `PixelTransition.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/PixelTransition/PixelTransition.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/PixelTransitionDemo.jsx`

## Зависимости

`react`; Canvas 2D.

## Совместимость и адаптация

`complex`, но удачная структура: рецепт R3 — задавать `state.progress`
из кадра (`interpolate(frame, [start, start + dur], [0, 1])`) и вызывать
`draw()` в эффекте; `seed` зафиксировать; hover не нужен.

## Паттерны

`comparison`, `transformation`
