# AnimatedGridPattern — `motion-primitives-website/animated-grid-pattern`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Сетка тонких линий, в которой случайные клетки по очереди мягко
загораются цветом и гаснут — «живая» матрица.

## Когда использовать

Техно-фон под данные, дашборды, ИИ, «система обрабатывает сигналы»;
нейтральнее частиц, но живее статичной сетки.

## Фразы из озвучки

- «система анализирует тысячи сигналов»
- «данные обрабатываются в реальном времени»
- «каждая клетка — это событие»

## Визуальный стиль

Клетка 40×40, линия 0.5 `text-border/30`, клетки `text-primary`
(переменные темы), до `maxOpacity` 0.5, цикл 4 с.

## Входные данные

`AnimatedGridPatternProps`: `width?` (40); `height?` (40);
`strokeDasharray?` (0); `numSquares?` (50); `maxOpacity?` (0.5);
`duration?` (4); `className?`.

## Анимации

Позиции клеток — детерминированный `seeded(i, salt)` (синус-хеш, сетка
40×20 клеток); motion `opacity [0, max, 0]` с `delay` 0–duration и
`repeatDelay` 0–2 с, бесконечно.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/interactive/wavy-background.tsx` — компонент

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: раскладка уже детерминирована (`seeded`), остаётся
заменить motion: для клетки `i` период `P = duration + repeatDelay_i`,
`u = (t - delay_i) mod P`, `opacity = u < duration ? maxOpacity*sin(π*u/duration) : 0`
(при `t < delay_i` — 0). Цвета `currentColor`-классов задать явно.

## Паттерны

`system-structure`, `quantities`, `abstract-concepts`
