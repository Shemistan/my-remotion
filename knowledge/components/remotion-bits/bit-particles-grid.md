# Grid Snap Particles (bit) — `remotion-bits/bit-particles-grid`

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

В центральной области кадра появляются полупрозрачные белые квадраты,
круги и ромбы, привязанные к сетке (клетка — 5 % ширины): «пиксельная»
мозаика, плавно проявляющаяся и исчезающая.

## Когда использовать

Абстрактный техно-фон: данные, пиксели, блоки, «цифровизация»; под
подписи о структуре и порядке. Для свободного блуждания — `bit-fireflies`.

## Фразы из озвучки

- «всё раскладывается по полочкам»
- «данные складываются в структуру»
- «пиксель за пикселем»

## Визуальный стиль

Монохромный белый с прозрачностью (`#ffffff22`/`#ffffff5f`), строгая сетка,
минимализм; фон не задан. 200 кадров, 1920×1080.

## Входные данные

Без props. `gridSize = floor(width·0.05)`. `Spawner`: `rate={1}`, `area` 52 %×74 %
кадра, `position={rect.center}`, `lifespan={150}`, `max={50}`,
`transition={{opacity:[0,1], duration:10}}`, 3 варианта формы.
`Behavior handler={snapToGridHandler}` — каждый шаг квантует позицию к
сетке и раз в 30 кадров должен сдвигать на клетку.

## Анимации

Проявление 10 кадров через `StaggeredMotion` спавнера; позиция квантуется
к сетке собственным поведением.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/ParticlesGrid.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/particles-grid.mdx` — документация

## Зависимости

`remotion-bits` (`Particles`, `Spawner`, `Behavior`, `useViewportRect`);
registry: `particle-system`, `use-viewport-rect`. Карточка — `particle-system.md`.

## Совместимость и адаптация

`native`. Подозрение по коду (без рендера): `p.seed` — дробное 0…1
(`random()`), поэтому `(p.seed + step) % 4` почти никогда не равно 0…3 и
«прыжки» по сетке не происходят — частицы стоят на месте. Для прыжков
брать `Math.floor(p.seed·4 + step) % 4`. Начальной скорости нет. Фон добавить.

## Паттерны

`system-structure`, `abstract-concepts`
