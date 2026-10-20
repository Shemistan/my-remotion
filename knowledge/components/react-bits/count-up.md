# CountUp — `react-bits/count-up`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Число, которое отсчитывается от `from` до `to` (или обратно): обычный
пересчёт текста либо «одометр» (`mode='roll'`) с прокручивающимися
разрядами, motion-blur по SVG-фильтру, разделителями и сокращением до 1.2K/3.4M.

## Когда использовать

Любая цифра в озвучке: пользователи, выручка, проценты, рост. Одометр —
когда нужна механика «счётчик крутится». Для чисто кадровой версии без
адаптации есть `remotion-bits/animated-counter`; для перехода между двумя
значениями с пружиной в разрядах — `react-bits/counter`.

## Фразы из озвучки

- «Нас уже больше 120 тысяч»
- «Выручка выросла до 3,4 миллиона»
- «Конверсия поднялась на 27 процентов»

## Визуальный стиль

`tabular-nums`, без своего оформления — типографика из `className/style`.
Easing по умолчанию `easeOut`, есть `expo`, `linear`, `spring` с перелётом.

## Входные данные

`to` (обяз.), `from=0`, `direction='up'` (`up|down`), `delay=0`, `duration=2` (с),
`className`, `style`, `startWhen=true`, `separator=''`, `prefix=''`, `suffix=''`,
`mode='count'` (`count|roll`), `easing='easeOut'` (`linear|easeOut|expo|spring`),
`decimals`, `format='standard'` (`standard|compact`), `trigger='view'`
(`view|load`), `replayOnHover=false`, `onStart`, `onEnd`.

## Анимации

`animate(0, total, {ease: 'linear', onUpdate: render})` из motion подаёт
время `t` в `render(t)`: значение `from + (to-from)*ease(t/duration)`;
в roll-режиме каждый разряд — колонка цифр с `translateY`, stagger 0.07 с,
blur пропорционален скорости. Старт — `useInView`.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/CountUp/CountUp.jsx` — компонент
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/CountUp/CountUp.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/CountUpDemo.jsx` — демо
- https://reactbits.dev/text-animations/count-up

## Зависимости

`motion` (`animate`, `cubicBezier`, `useInView`).

## Совместимость и адаптация

`adaptable`: `render(t)` уже чистая функция времени. Рецепт: убрать
`animate`/`useInView`, вызывать логику `render` с `t = max(0, frame/fps - delay)`
(в count-режиме — просто `formatValue(from + (to-from)*ease(t/duration))`
прямо в JSX). Для roll — вычислять `translateY` колонок и `stdDeviation` blur
в рендере вместо записи в DOM через ref. `replayOnHover` не нужен.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
