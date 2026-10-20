# Falling Snow Particles (bit) — `remotion-bits/bit-particles-snow`

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

Снегопад на тёмно-синем ночном фоне: мягкие снежинки трёх размеров падают
сверху, покачиваются и сносятся лёгким ветром вправо; кадр заполнен уже с
первого кадра.

## Когда использовать

Зима, праздники, тишина, «холодный» сезон в метриках, спокойный фон для
титров. Для тёплого ночного фона — `bit-fireflies`.

## Фразы из озвучки

- «за окном тихо падает снег»
- «зимний сезон всегда спокойнее»
- «с наступающим Новым годом»

## Визуальный стиль

Фон `#01050e`, снежинки — радиальные градиенты белого/голубоватого
(1, 2, 4 vmin), спокойный медленный темп. 300 кадров, 1920×1080.

## Входные данные

Без props. `Spawner`: `rate={1}`, `area` = ширина кадра × 0, `position` =
`resolvePoint(rect, {x:"center", y:-200})`, `lifespan={200}`,
`startFrame={200}` (пре-прогрев), `transition={{opacity:[0,1]}}`, 3 варианта.
`Behavior`: `gravity={{y:0.1}}`, `wiggle={{magnitude:1, frequency:0.5}}`,
`handler={(p) => { p.velocity.x += 0.01 }}` (ветер).

## Анимации

Детерминированная симуляция: гравитация, случайное покачивание, снос;
проявление каждой снежинки через `StaggeredMotion` спавнера.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/ParticlesSnow.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/particles-snow.mdx` — документация

## Зависимости

`remotion` (`AbsoluteFill`), `remotion-bits` (`Particles`, `Spawner`,
`Behavior`, `useViewportRect`, `resolvePoint`); registry: `particle-system`,
`use-viewport-rect`. Карточка — `particle-system.md`.

## Совместимость и адаптация

`native`. Без `drag` скорость растёт (гравитация + ветер) — при длинном
lifespan снежинки разгоняются; при более длинной сцене добавить
`<Behavior drag={0.98}/>`. Стоимость симуляции растёт с lifespan×rate.

## Паттерны

`abstract-concepts`, `timeline`
