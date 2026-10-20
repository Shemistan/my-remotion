# SlidingNumber — `motion-primitives/sliding-number`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives` (`templates/react-libriry/motion-primitives`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENCE.md, © 2024 ibelick) |

## Что визуализирует

Число-«барабан»: каждая цифра — колонка 0–9, которая вертикально
прокручивается к нужному значению по кратчайшему пути (как счётчик
одометра/табло). Поддержка знака минус и дробной части.

## Когда использовать

Часы, таймер обратного отсчёта, счётчик, который меняется ступенчато
(1 → 2 → 3), табло со счётом. Для плавного роста большого числа —
`animated-number`.

## Фразы из озвучки

- «осталось всего 10 секунд»
- «счёт сравнялся: 2 : 2»
- «заказов за день — уже 128»

## Визуальный стиль

`tabular-nums`, `leading-none`, цифра шириной `1ch`, обрезка по
вертикали; spring `stiffness 280, damping 18, mass 0.3`.

## Входные данные

`SlidingNumberProps`: `value: number`; `padStart?` (false — дополняет
нулём числа < 10); `decimalSeparator?` (`'.'`).

## Анимации

Для разряда `place`: цифра `floor(value/place) % 10` → `useSpring`; каждая
из 10 цифр колонки сдвигается на `y = offset * height`, где
`offset = (10 + n - v) % 10` (с переносом при `offset > 5`).
Высота строки берётся `useMeasure`.

## Исходники и документация

- `templates/react-libriry/motion-primitives/components/core/sliding-number.tsx` — компонент
- `templates/react-libriry/motion-primitives/app/docs/sliding-number/page.mdx` — документация
- `templates/react-libriry/motion-primitives/app/docs/sliding-number/clock.tsx` — пример: часы на `setInterval`

## Зависимости

`motion` (`useSpring`, `useTransform`, `motionValue`, `layoutId`),
`react-use-measure`.

## Совместимость и адаптация

`adaptable`: формула позиции — чистая функция от значения; убрать
`useMeasure` (высота = `1em` при `leading-none`, сдвиг в `em`), spring
motion → `v = interpolate(spring({frame: frame - tChange, fps, config:{stiffness:280, damping:18, mass:0.3}}), [0,1], [old, new])`
по разряду, `layoutId` убрать. Пример `clock.tsx` использует
`setInterval` и `new Date()` — в видео время брать из кадра.

## Паттерны

`quantities`, `timeline`, `growth-decline`
