# LiquidChrome — `react-bits/liquid-chrome`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Жидкий хром: зеркальная металлическая поверхность с волнами и отражениями;
курсор возмущает жидкость (симуляция на сетке `SIM_CELL = 4`).

## Когда использовать

Индустриальный/премиальный тех-фон: железо, металл, «отлито в форме»,
футуризм Y2K.

## Фразы из озвучки

- «надёжность, отлитая в металле»
- «технология, которая течёт как ртуть»
- «гибкость без потери прочности»

## Визуальный стиль

Серебристый хром (`color = '#ffffff'`), высокий контраст, медленные волны.

## Входные данные

Из usage: `color = '#ffffff'`, `speed = 0.2`, `amplitude = 0.3`,
`detail = 4`, `thickness = 1`, `interactive = true`. Остальное —
PropTable демо.

## Анимации

Сырой WebGL2: процедурные волны по времени + симуляция возмущений с
фиксированным шагом `SIM_STEP = 1/120` в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/LiquidChrome/LiquidChrome.jsx` (+ `LiquidChrome.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/LiquidChrome/LiquidChrome.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/LiquidChromeDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1, `interactive={false}` — тогда симуляция возмущений
пустая и картинка зависит только от времени.

## Паттерны

`transformation`, `abstract-concepts`
