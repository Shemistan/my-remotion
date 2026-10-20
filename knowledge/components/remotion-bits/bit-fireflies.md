# Fireflies (bit) — `remotion-bits/bit-fireflies`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Светлячки: по всему кадру рождаются салатовые светящиеся точки, плавно
загораются, хаотично блуждают и гаснут.

## Когда использовать

Атмосферный «живой» фон: магия, идеи, вечер, уют, природа; под спокойную
музыку и титры. Для падающего фона — `bit-particles-snow`, для взрыва
радости — `bit-counter-confetti`.

## Фразы из озвучки

- «вокруг загораются новые идеи»
- «тихий летний вечер»
- «маленькие огоньки надежды»

## Визуальный стиль

Круги диаметром `1vmin`, `#ccff00` с `box-shadow` свечением `2vmin`;
фон не задан (прозрачный — нужен тёмный под ним). 300 кадров; размер в
metadata не указан.

## Входные данные

Без props. `Spawner`: `rate={0.2}`, `max={200}`, `area` = весь кадр,
`position` = центр, `lifespan={100}`, `velocity={{x:0.5, y:0.5,
varianceX:1, varianceY:1}}`. `Behavior`: `wiggle={{magnitude:2,
frequency:0.1}}`, `wiggleVariance={1}`. Размеры через `useViewportRect`.

## Анимации

Каждая частица обёрнута в `StaggeredMotion` с `opacity: [0, 1, 0]`, которую
`Particles` растягивает на `lifespan` (cycleOffset = возраст) — вспышка за
жизнь; движение — wiggle поверх начальной скорости.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/Fireflies.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/fireflies.mdx` — документация

## Зависимости

`remotion-bits` (`Particles`, `Spawner`, `Behavior`, `StaggeredMotion`,
`useViewportRect`); registry: `particle-system`, `use-viewport-rect`.
Карточка компонента — `particle-system.md`.

## Совместимость и адаптация

`native`. Добавить тёмный фон; первые ~кадры почти пустые (rate 0.2/кадр,
без `startFrame`) — для заполненного кадра с нуля задать `startFrame={100}`.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
