# CRTWarp — `react-bits/crt-warp`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Изогнутый экран ЭЛТ с маской люминофора (апертурная решётка, теневая
маска, щелевая), по которому бегут волны контента; послесвечение.

## Когда использовать

Ретро-ТВ, «прямой эфир из прошлого», аналоговый сигнал, игровая эстетика.

## Фразы из озвучки

- «как в старом телевизоре»
- «сигнал из прошлого»
- «настройтесь на нашу волну»

## Визуальный стиль

Фиолетовый люминофор (`#c755f7`) на тёмном (`#120f17`), кривизна 0.25.

## Входные данные

Из usage: `color = '#c755f7'`, `backgroundColor = '#120f17'`,
`mask = 'aperture'` (`none|aperture|shadow|slot`), `curvature = 0.25`,
`persistence = 0.4`. Остальное — PropTable демо.

## Анимации

WebGL2 (`CONTENT`-шейдер с `uTime`, `uAmplitude`), интро 1.6 с,
переворот 0.8 с (`FLIP_SECONDS`), послесвечение `persistence`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/CRTWarp/CRTWarp.jsx` (+ `CRTWarp.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/CRTWarp/CRTWarp.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/CRTWarpDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1; `persistence = 0`, иначе кадр зависит от
предыдущего. Есть ли интерактив — по коду не уточнено (в usage нет).

## Паттерны

`abstract-concepts`, `transformation`
