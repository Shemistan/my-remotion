# Particles utilities — `remotion-bits/particles-utilities`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; типы частиц, фабрики поведений и детерминированный
симулятор, на которых построен `particle-system`.

## Когда использовать

Свой рендер частиц (SVG, Canvas, `@remotion/three`) с той же физикой;
собственное поведение (`handler`) — притяжение к точке, вихрь, отскок.

## Фразы из озвучки

Косвенно:
- «частицы притягиваются к центру»
- «всё закручивается в вихрь»
- «искры гаснут, падая вниз»

## Входные данные

Типы `Vector3`, `Particle`, `SpawnerConfig`, `SpawnerShape`,
`ParticleBehaviorHandler(particle, age, {frame, fps})`, `BehaviorConfig`.
Поведения: `movement` (Эйлер, сброс ускорения), `createGravity({x?,y?,z?,
variance*})`, `createDrag(factor, variance?)`, `createWiggle(magnitude,
frequency=0.5, variance?)`, `createOpacityOverLife([start,end], sV?, eV?)`,
`createScaleOverLife(start, end, sV?, eV?)`. `simulateParticles({frame, fps,
spawners, behaviors}) → Particle[]` (отсортированы по рождению).

## Анимации

Нет собственных; симуляция — реплей от рождения до текущего кадра.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/utils/particles/types.ts` — типы
- `templates/remotion-components/remotion-bits/src/utils/particles/behaviors.ts` — поведения
- `templates/remotion-components/remotion-bits/src/utils/particles/simulator.ts` — симулятор
- `templates/remotion-components/remotion-bits/src/utils/particles/index.ts` — реэкспорт
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/particle-system.mdx` — справка

## Зависимости

`remotion` (`random`); тип `StaggeredMotionTransitionProps` из компонента.

## Совместимость и адаптация

`native`. Фабрики с variance держат `Map` по `p.id` внутри замыкания —
результат детерминирован, но кэш растёт со временем; создавать поведения в
`useMemo`. Свой `handler` должен быть чистым (без `Math.random`).

## Паттерны

нет
