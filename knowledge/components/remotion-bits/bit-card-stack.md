# 3D Card Stack (bit) — `remotion-bits/bit-card-stack`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Восемь пронумерованных карточек (чередуются оранжевая/коричневая) влетают
снизу по очереди и ложатся веером: у каждой свой поворот, сдвиг по X и
глубина по Z.

## Когда использовать

Колода вариантов, тарифов, кейсов, «несколько карточек в руке»; появление
набора однотипных объектов с ощущением объёма. Для ровной сетки —
`bit-grid-stagger`, для 3D-вращения — `bit-carousel-3d`.

## Фразы из озвучки

- «у нас восемь вариантов на выбор»
- «разложим все карты на стол»
- «каждый кейс — отдельная история»

## Визуальный стиль

Крупные скруглённые карточки (radius 24, полупрозрачная рамка, глубокая
тень), цифра на 40% ширины; 120 кадров, 1080×1080; пружинистый вход.

## Входные данные

Без props: `count = 8`, `cardWidth = vmin*30`, `cardHeight = 1.5×`; веер —
`angle = (i-3.5)*8°`, `xOffset = (i-3.5)*60px`, `zOffset = -10i`. Цвета и
содержимое карточек зашиты.

## Анимации

`StaggeredMotion` `y: [800, 0]`, `frames: [0, 50]`, `stagger: 3`,
`easing: "spring"`; веер — статичный transform внутренней карточки (не
анимируется), `transformStyle: preserve-3d`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/CardStack.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/card-stack.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `useViewportRect` (в registryDependencies
указан только `staggered-motion`).

## Совместимость и адаптация

`native`. Для смысла «раскрытия» анимировать сам веер (angle/xOffset из 0 по
прогрессу) — сейчас карточки прилетают уже разложенными. Нет фона и
перспективы у родителя — добавить `perspective` и фон.

## Паттерны

`comparison`, `sequence-steps`, `quantities`
