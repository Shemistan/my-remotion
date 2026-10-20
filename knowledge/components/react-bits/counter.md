# Counter — `react-bits/counter`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `dom`, `svg` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Число-одометр: каждый разряд — вертикальная лента цифр 0–9, которая
докручивается до нового значения с пружиной, motion-blur и маской-затуханием
по краям; новые разряды и разделители плавно «вырастают» по ширине.
Форматирование через `Intl.NumberFormat` (валюта, проценты, локали).

## Когда использовать

Переход значения «было → стало», табло, цена, курс, счётчик пользователей.
Для отсчёта «с нуля до N» по монтированию — `react-bits/count-up`; кадровая
версия без адаптации — `remotion-bits/animated-counter`.

## Фразы из озвучки

- «Цена снизилась с 1 990 до 1 490 рублей»
- «Счётчик заказов продолжает расти»
- «Доля рынка — уже 42 процента»

## Визуальный стиль

Крупно (`fontSize=100`), табличные цифры, мягкое затухание краёв окна
(`fade=0.3em`), пружина 0.7 с с небольшим перелётом (`bounce=0.2`).

## Входные данные

`value=0`, `locale='en-US'`, `format` (опции `Intl.NumberFormat`), `decimals`,
`minDigits=1`, `prefix`, `suffix`, `direction='auto'` (`auto|up|down|shortest`),
`duration=0.7`, `bounce=0.2`, `stagger=0.04`, `motionBlur=true`, `intro=true`,
`fade=0.3`, `fontSize=100`, `fontWeight='inherit'`, `textColor='inherit'`,
`gap=0`, `padding=0`, `tabular=true`, `digitStyle`, `className`, `style`.

## Анимации

При смене `value` каждому разряду ставится цель (с учётом направления) и
задержка `order * stagger`; rAF интегрирует пружину (ω = 2π/duration,
ζ = 1 − bounce); цифры сдвигаются `translateY`, blur — `feGaussianBlur`.
`intro` — полный оборот разрядов при входе в экран (`IntersectionObserver`).

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/Components/Counter/Counter.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/Components/Counter/Counter.css` — стили ленты и окна
- `templates/react-libriry/react-bits/src/ts-default/Components/Counter/Counter.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/Components/CounterDemo.jsx` — демо
- https://reactbits.dev/components/counter

## Зависимости

Нет внешних пакетов (React, `Intl`).

## Совместимость и адаптация

`adaptable`: разметка (ленты цифр) и форматирование остаются, движок
заменяется аналитической пружиной. Рецепт: для разряда с порядком `o`
`pos = from + delta * spring({frame: frame - start - o*stagger*fps, fps, config:{damping, stiffness}})`,
`translateY` numeral `n` = `wrap(n - pos)*100%` в рендере; blur
`stdDeviation` — от производной пружины. `rAF`, `IntersectionObserver`,
`ResizeObserver` убрать; ширины цифр измерить один раз после загрузки шрифта
(`delayRender`).

## Паттерны

`quantities`, `growth-decline`, `transformation`
