# Ticker — `animata/ticker`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `numbers-counters` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `dom`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Число-«барабан»: каждая цифра — вертикальная лента 0–9, которая
пружинисто прокручивается до нужной цифры; нецифровые символи (точка,
запятая, $) стоят на месте.

## Когда использовать

Котировки, цены, табло, KPI, где эффектнее «барабан», чем плавный счётчик
(`animata/counter`).

## Фразы из озвучки

- «акции выросли до 456 долларов»
- «курс составил …»
- «цифры говорят сами за себя»

## Визуальный стиль

`tabular-nums`, `whitespace-pre`, размер через `className`; разные
stiffness по разрядам дают «волну».

## Входные данные

`value: string` (например `"456.78"`), `delay?: number` (мс; без delay цифра
сразу ставится на место без анимации), `className?`, `numberClassName?`.

## Анимации

`useSpring(…, {stiffness: 150 − index*2, damping: 15})` → `translateY =
−height*digit`; старт по `useInView` (`once`) и `setTimeout((total−index)*
floor(random*delay))`; высота — `getBoundingClientRect`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/ticker.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/ticker.mdx` — документация
- `templates/react-libriry/animata/animata/text/ticker.stories.tsx` — пример

## Зависимости

`motion` (`useInView`, `useMotionValue`, `useSpring`, `motion.div`).

## Совместимость и адаптация

Высоту строки задать константой (`1em` / line-height); для цифры i
`translateY = −digit·lineHeight · spring({frame: frame − delay_i, fps,
config: {stiffness: 150 − 2i, damping: 15}})`, `delay_i` из `random(seed+i)`.
`useInView`/таймеры убрать.

## Паттерны

`quantities`, `growth-decline`
