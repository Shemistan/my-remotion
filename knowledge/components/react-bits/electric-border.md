# ElectricBorder — `react-bits/electric-border`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `webgl`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause (`LICENSE.md`) |

## Что визуализирует

Электрическая рамка вокруг контента: несколько дрожащих разрядов-нитей
бегут по скруглённому контуру, с дугами и импульсами.

## Когда использовать

Подсветить карточку/продукт как «заряженный», мощный, новый; энергия,
скорость, AI.

## Фразы из озвучки

- «мощность нового поколения»
- «этот тариф заряжен по максимуму»
- «энергия, которую чувствуешь»

## Визуальный стиль

Голубой электрический (`color = '#7df9ff'`), радиус 24, 3 нити.

## Входные данные

Из usage: `color = '#7df9ff'`, `speed = 1`, `chaos = 0.5`, `spread = 0.6`,
`strands = 3`, `thickness = 1.5`, `borderRadius = 24`, `children`.
Остальное — PropTable демо.

## Анимации

WebGL2 (fullscreen-треугольник за контентом с полем `MARGIN = 64`),
дуги (`ARCS = 4`) и импульсы (`PULSES = 3`, `SURGE_SPEED = 560`) по
времени в rAF.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Animations/ElectricBorder/ElectricBorder.jsx` (+ `ElectricBorder.css`)
- `templates/react-libriry/react-bits/src/ts-default/Animations/ElectricBorder/ElectricBorder.tsx`
- `templates/react-libriry/react-bits/src/demo/Animations/ElectricBorderDemo.jsx`

## Зависимости

`react`; WebGL2 без внешних библиотек.

## Совместимость и адаптация

`complex`: рецепт R1. Наличие hover-реакции построчно не сверено.

## Паттерны

`key-point-emphasis`
