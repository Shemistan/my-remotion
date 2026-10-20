# MagnetLines — `react-bits/magnet-lines`

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

Сетка коротких штрихов (линии, стрелки, стрелки компаса), которые
поворачиваются к точке-«магниту» — как железные опилки в магнитном поле.
Режимы `orbit | attract | spiral | dipole`.

## Когда использовать

«Всё тянется к одному центру»: притяжение аудитории, фокус, силовое поле,
направление. Без указателя работает только с `idle`-движением (prop `idle`
есть в демо, по умолчанию `false`) — точку притяжения лучше задавать по
кадру.

## Фразы из озвучки

- «все силы направлены к одной цели»
- «клиенты сами тянутся к продукту»
- «поле притяжения вокруг идеи»

## Визуальный стиль

Светлые штрихи (`#efefef`) на тёмном, акцентный цвет у «магнита».

## Входные данные

`spacing = 30`, `rows`, `columns`, `containerSize`, `lineColor = '#efefef'`,
`accentColor`, `lineWidth = 2`, `lineHeight = 18`, `baseAngle = -10`,
`mode = 'orbit'`, `shape = 'line'` (`line|arrow|needle`), `radius = 200`,
`fade = 0.65`; в демо также `clickPulse`, `intro`, `idle`. Полный список —
PropTable демо.

## Анимации

Сырой WebGL2 (инстансы штрихов, `aState` = угол/акцент/вспышка/видимость),
сглаживание углов в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Backgrounds/MagnetLines/MagnetLines.jsx` (+ `MagnetLines.css`)
- `templates/react-libriry/react-bits/src/ts-default/Backgrounds/MagnetLines/MagnetLines.tsx`
- `templates/react-libriry/react-bits/src/demo/Backgrounds/MagnetLinesDemo.jsx`

## Зависимости

`react`; сырой WebGL2.

## Совместимость и адаптация

`complex`: рецепт R1 + подменить координаты указателя программной
траекторией от кадра (иначе поле статично); сглаживание углов —
накопительное, его пересчитывать прогоном до кадра или убрать.

## Паттерны

`relationships`, `cause-effect`, `spatial`
