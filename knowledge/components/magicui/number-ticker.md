# NumberTicker — `magicui/number-ticker`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Число, которое пружинисто докручивается от `startValue` до `value`
(или обратно) с разделителями тысяч и фиксированным числом знаков.

## Когда использовать

Любая метрика, произнесённая цифрой: пользователи, выручка, проценты,
рост. В Remotion-проектах аналог `remotion-bits/animated-counter`
(native) предпочтительнее; этот — если нужен именно вид Magic UI.

## Фразы из озвучки

- «более 10 000 довольных клиентов»
- «рост на 47 процентов»
- «за год — 2,5 миллиона загрузок»

## Визуальный стиль

`tabular-nums`, `tracking-wider`, чёрный/белый; формат `en-US`
(запятые-разделители); пружина damping 60 / stiffness 100 — быстрый
старт и мягкое торможение.

## Входные данные

- `value: number` (обязателен), `startValue?` = `0`
- `direction?: "up"|"down"` = `"up"`, `delay?` = `0` (с)
- `decimalPlaces?` = `0`, `className?`, атрибуты `span`.

## Анимации

`useMotionValue` → `useSpring({damping: 60, stiffness: 100})`; старт по
`useInView(once)` + `setTimeout(delay·1000)`; на `change` пружины
`ref.textContent = Intl.NumberFormat("en-US", …).format(…)` (мимо
React).

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/number-ticker.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/number-ticker.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/number-ticker-demo.tsx` — пример

## Зависимости

`motion` (`useInView`, `useMotionValue`, `useSpring`), `cn`.

## Совместимость и адаптация

`adaptable`. Заменить на `const p = spring({frame: frame - delay·fps,
fps, config: {damping: 60, stiffness: 100}})`, значение `start + (value
- start)·p` (для `down` — наоборот), рендерить строку в JSX через тот
же `Intl.NumberFormat` (для русского — `"ru-RU"`). `useInView`,
`setTimeout` и прямую запись в `textContent` убрать.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
