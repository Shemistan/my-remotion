# Ferrofluid — `react-bits/ferrofluid`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Поверхность магнитной жидкости в наклонной перспективе: из неё растут
острые шипы над невидимыми магнитами (`magnets`), которые движутся;
курсор — дополнительный магнит, клик — импульс.

## Когда использовать

Притяжение, магнетизм, «тянет к продукту», наука, необычная физика.

## Фразы из озвучки

- «магнетизм бренда»
- «сила притяжения работает на нас»
- «наука, которая завораживает»

## Визуальный стиль

Белая/серебристая жидкость (`colors = ['#ffffff', ...]`), наклон 48°.

## Входные данные

Из usage: `colors = ['#ffffff', '#ffffff', '#ffffff']`, `spikeHeight = 1`,
`sharpness = 2.5`, `tilt = 48`, `magnets = 2`, `mouseInteraction`,
`clickPulse`. Остальное — PropTable демо.

## Анимации

WebGL2 (импортов нет), движение магнитов по времени (rAF).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/Ferrofluid/Ferrofluid.jsx` (+ `Ferrofluid.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/Ferrofluid/Ferrofluid.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/FerrofluidDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1, `mouseInteraction={false}`, `clickPulse={false}`.

## Паттерны

`relationships`, `cause-effect`
