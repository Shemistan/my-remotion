# BoidsEcosystem — `animata/boids-ecosystem`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `raf`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Стая (boids) из маленьких треугольников или точек на тёмном canvas: агенты
выравниваются, сближаются и расталкиваются, оставляя лёгкий шлейф; курсор
их распугивает, «аттракторы» притягивают.

## Когда использовать

Метафора коллективного поведения, роя, экосистемы, «пользователи сами
находят путь», трафик. Если нужно просто «звёздное небо» — проще
`animata/shooting-stars`.

## Фразы из озвучки

- «тысячи пользователей движутся как одна стая»
- «система сама находит равновесие»
- «всё притягивается к одной точке — к вашему продукту»

## Визуальный стиль

Фон `#0b0b12`, палитра `#f5f5f4 #fde68a #93c5fd #fca5a5`, треугольники 10px,
шлейф за счёт полупрозрачной заливки кадра (`${bg}dd`). Живой, органичный.

## Входные данные

`count = 120`, `background = "#0b0b12"`, `palette = DEFAULT_PALETTE`,
`cursorRadius = 90`, `attractors?: {x, y (0..1), strength? (0.05), radius? (220)}[]`,
`agentsRef?: RefObject<BoidAgent[]>`, `agentShape: "triangle" | "dot" = "triangle"`,
`className?`, `children?` (по центру, pointer-events-none).

## Анимации

Свой цикл `requestAnimationFrame`: выравнивание/сцепление/разделение
(perception 36px, maxSpeed 1.8), притяжение к аттракторам, отталкивание от
курсора (`pointermove` на window), заворачивание по краям. Старт из
`Math.random`. Размер canvas — `getBoundingClientRect` + `ResizeObserver`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/boids-ecosystem.tsx` — компонент
- `templates/react-libriry/animata/content/docs/background/boids-ecosystem.mdx` — документация
- `templates/react-libriry/animata/animata/background/boids-ecosystem.stories.tsx` — пример

## Зависимости

React, `@/lib/utils` (`cn`).

## Совместимость и адаптация

`complex`: симуляция накопительная (состояние кадра N зависит от N−1) и
случайная. Переписать: начальное состояние из `random(seed)` remotion, в
компоненте при каждом `frame` пересчитывать симуляцию с нуля до `frame`
шагов (или кешировать по ref, если кадры идут подряд) и рисовать в
`useEffect` с `delayRender/continueRender`. Курсор убрать; аттракторы
можно двигать по кадру (сюжет «стая летит к цели»).

## Паттерны

`relationships`, `abstract-concepts`, `system-structure`
