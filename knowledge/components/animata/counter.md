# Counter — `animata/counter`

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

Крупное число, которое пружинисто докручивается от 0 до цели (или от цели
до 0), с форматированием разрядов или валюты.

## Когда использовать

Любая метрика в озвучке: пользователи, выручка, звёзды на GitHub. Для
«барабана» цифр — `animata/ticker`.

## Фразы из озвучки

- «больше тысячи клиентов»
- «выручка выросла до миллиона долларов»
- «счётчик обнулился»

## Визуальный стиль

`text-4xl font-bold`, нейтральный цвет `text-foreground`.

## Входные данные

`CounterProps`: `targetValue: number` (1000), `direction?: "up" | "down"`
(`"up"`), `delay?: number` (0, мс), `format?: (v) => string` (по умолчанию
`Formatter.number` — `Intl.NumberFormat("en-US")`; есть `Formatter.currency`
USD), `className?`.

## Анимации

`useSpring(motionValue, {damping: 60, stiffness: 80})`; старт по `useInView`
(`once`) + `setTimeout(delay)`; текст пишется в DOM в `useMotionValueEvent`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/counter.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/counter.mdx` — документация
- `templates/react-libriry/animata/animata/text/counter.stories.tsx` — пример

## Зависимости

`motion` (`useInView`, `useMotionValue`, `useSpring`, `useMotionValueEvent`).

## Совместимость и адаптация

Убрать `useInView`/`setTimeout`/motion-значения; значение =
`spring({frame: frame - delayFrames, fps, config: {damping: 60, stiffness:
80}}) * targetValue` (или `1 - …` для `down`), вывод через `format`. Для
русской озвучки — `Intl.NumberFormat("ru-RU")`.

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
