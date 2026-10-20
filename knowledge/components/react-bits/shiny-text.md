# ShinyText — `react-bits/shiny-text`

| Поле | Значение |
|---|---|
| Репозиторий | `react-bits` (`templates/react-libriry/react-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `raf`, `timers`, `dom`, `canvas`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT + Commons Clause v1.0 (LICENSE.md) |

## Что визуализирует

Текст с полосой блика, которая проходит по буквам (одна–три полосы, угол,
мягкость края, опциональное свечение): от «мягкого света» до хромового отблеска.

## Когда использовать

Премиальность, новинка, «золотой» тариф, логотип или CTA, который должен
поблёскивать, не отвлекая. Для переливающихся цветов — `react-bits/gradient-text`.

## Фразы из озвучки

- «Премиум-подписка теперь доступна всем»
- «Это наш флагманский продукт»
- «Новая функция, которая уже сияет в релизе»

## Визуальный стиль

Серый текст `#b5b5b5` и белый блик `#ffffff` по умолчанию, градиент через
`background-clip: text`; спокойный темп (проход за 2 с).

## Входные данные

`text` или `children`, `color='#b5b5b5'`, `shineColor='#ffffff'`, `speed=2`
(с на проход), `delay=0`, `angle=120`, `shineWidth=40` (2–200, %), `softness=0.8`,
`bands=1` (1–3), `glow=0` (0–1), `direction='left'` (`left|right`),
`easing='smooth'` (`linear|smooth|snappy`), `trigger='loop'`
(`loop|hover|view`), `yoyo=false`, `followPointer=false`, `pauseOnHover=false`,
`disabled=false`, `className`, `style`.

## Анимации

rAF-цикл двигает позицию блика `pos = from + (to - from) * ease(t)` и
пересобирает `linear-gradient` с плавными стопами (`gradient(pos)` — чистая
функция). Пауза между проходами — `setTimeout`; `view` — `IntersectionObserver`;
цвета парсятся через 2D-canvas.

## Исходники и документация

- `templates/react-libriry/react-bits/src/content/TextAnimations/ShinyText/ShinyText.jsx` — компонент
- `templates/react-libriry/react-bits/src/content/TextAnimations/ShinyText/ShinyText.css` — стили (`background-clip: text`)
- `templates/react-libriry/react-bits/src/ts-default/TextAnimations/ShinyText/ShinyText.tsx` — TS-вариант
- `templates/react-libriry/react-bits/src/demo/TextAnimations/ShinyTextDemo.jsx` — демо
- https://reactbits.dev/text-animations/shiny-text

## Зависимости

Нет внешних пакетов (React + CSS).

## Совместимость и адаптация

`adaptable`: rAF лишь считает прогресс прохода. Рецепт: `cycle = (speed + delay)*fps`,
`t = clamp((frame % cycle) / (speed*fps))`, `pos = entry + (exit - entry)*ease(t)`
и та же функция `gradient(pos)` в inline `backgroundImage` (а также у слоя
glow). Удалить rAF, `setTimeout`, `IntersectionObserver`, pointer-события.
`parseColor` через canvas работает в headless Chrome, но проще передавать
цвета в `rgba`.

## Паттерны

`key-point-emphasis`
