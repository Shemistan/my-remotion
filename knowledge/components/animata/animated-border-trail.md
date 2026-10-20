# AnimatedBorderTrail — `animata/animated-border-trail`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Обёртка-карточка, по рамке которой бесконечно бежит светящийся «хвост»
цвета `trailColor` (conic-gradient, вращающийся вокруг центра).

## Когда использовать

Выделить одну карточку/кнопку/цифру среди прочих: «рекомендуем»,
«главный тариф», «вот это важно».

## Фразы из озвучки

- «обратите внимание именно на этот вариант»
- «самое популярное решение»
- «вот ключевая цифра»

## Визуальный стиль

Серая рамка 1px (`bg-gray-200 p-px`), белое содержимое rounded-2xl,
фиолетовый (`purple`) огонёк; цикл 10 с, линейно.

## Входные данные

`AnimatedTrailProps extends HTMLAttributes<div>`: `duration = "10s"`,
`trailColor = "purple"`, `trailSize: "sm" | "md" | "lg" = "md"`
(5/10/20% окружности), `contentClassName?`, `className?`, `children`.

## Анимации

`@property --border-trail-angle` + `@keyframes border-trail` (0→360deg) из
локального CSS; фон `conic-gradient(from var(--border-trail-angle), …)`.

## Исходники и документация

- `templates/react-libriry/animata/animata/container/animated-border-trail.tsx` — компонент
- `templates/react-libriry/animata/animata/container/animated-border-trail.css` — `@property` и keyframes
- `templates/react-libriry/animata/content/docs/container/animated-border-trail.mdx` — документация
- `templates/react-libriry/animata/animata/container/animated-border-trail.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: убрать `animation` и подставить угол прямо в градиент —
`conic-gradient(from ${(frame/fps/10*360) % 360}deg at 50% 50%, …)`;
`@property` тогда не нужен (и не зависит от поддержки в headless Chrome).

## Паттерны

`key-point-emphasis`
