# Fountain Burst Particles (bit) — `remotion-bits/bit-particles-fountain`

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

Фонтан светящихся шариков бьёт из-под нижнего края кадра вверх, частицы
расходятся веером и падают под гравитацией; среди них мелкие янтарные,
серые и большие едва заметные фиолетовые ореолы.

## Когда использовать

Всплеск энергии, «запуск», рост интереса, фон для финала; вертикальное
движение вверх под слова о росте. Для конфетти по бокам —
`bit-counter-confetti`, для спокойного фона — `bit-fireflies`.

## Фразы из озвучки

- «интерес к продукту бьёт ключом»
- «и вот — запуск!»
- «энергия поднимается снизу вверх»

## Визуальный стиль

Радиальные градиенты `#ebb03b`, серый, `rgba(176,126,223,0.05)` размером
1–30 vmax; фон не задан. 60 кадров, 1920×1080.

## Входные данные

Без props. `Spawner`: `rate={10}`, `burst={20}`, `position` = `resolvePoint(rect,
{x:"center", y:"110%"})`, `area` 10 % ширины, `velocity` y = −5 % высоты/кадр,
varianceX 10 % ширины, varianceY 1 % высоты, `lifespan={100}`,
`startFrame={100}`, `max={200}`, 4 варианта-ребёнка. `Behavior
gravity={{y:0.2}}`.

## Анимации

Баллистика частиц (начальная скорость + гравитация) из детерминированной
симуляции; вариант частицы выбирается по seed. `startFrame=100` — фонтан
уже бьёт с первого кадра.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/ParticlesFountain.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/particles-fountain.mdx` — документация

## Зависимости

`remotion-bits` (`Particles`, `Spawner`, `Behavior`, `useViewportRect`,
`resolvePoint`); registry: `particle-system`, `use-viewport-rect`.
Карточка — `particle-system.md`.

## Совместимость и адаптация

`native`. По коду `burst={20}` вместе со `startFrame={100}` бесполезен:
burst-частицы рождаются на кадре 0 симуляции и к видимому кадру 0 им уже
100 = `lifespan` — они не видны (вывод из simulator.ts, без рендера).
Для видимого выплеска убрать `startFrame` или поставить отдельный
спавнер с burst. `AbsoluteFill` импортирован, не используется; фон добавить.

## Паттерны

`growth-decline`, `key-point-emphasis`, `abstract-concepts`
