# FloatingShapes — `motion-primitives-website/floating-shapes`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `external-service`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

3D-фон: металлические фигуры (искажающаяся сфера, тор, каркасный
икосаэдр) парят и вращаются в облаке частиц, освещённые HDR-окружением.

## Когда использовать

Абстрактный премиальный 3D-фон для интро, продуктовых и технологических
сцен; пресеты: `minimal` (одна белая сфера), `vibrant`, `monochrome`,
`neon`.

## Фразы из озвучки

- «добро пожаловать в новое измерение»
- «технологии будущего уже здесь»
- «форма и содержание»

## Визуальный стиль

`vibrant`: сфера `#8B5CF6`, тор `#EC4899`, икосаэдр `#06B6D4`, частицы
фиолетовые; metalness 0.8–0.9; камера `[0,0,6]`, fov 75;
`Environment preset="city"`.

## Входные данные

`FloatingShapesProps`: `preset?: 'minimal'|'vibrant'|'monochrome'|'neon'`
(`'vibrant'`); `className?`. Подкомпоненты экспортируются:
`DistortedSphere`, `FloatingTorus`, `FloatingIcosahedron`,
`ParticleField` (`position`, `color`, `speed`, …).

## Анимации

Вращение от `state.clock.getElapsedTime()`; `Float` (drei) —
покачивание по своим часам; `MeshDistortMaterial` — искажение по
внутреннему времени; частицы — `Math.random` позиции, медленное
вращение облака.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/three/floating-shapes.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Floating Shapes»

## Зависимости

`@react-three/fiber`, `@react-three/drei` (`Float`, `MeshDistortMaterial`,
`Environment`, `Sphere`), `three`, `@/lib/utils`.

## Совместимость и адаптация

`complex`: время из часов R3F/drei (включая `Float` и
`MeshDistortMaterial`, которые управлять кадром напрямую не дают),
`Math.random` частиц, `Environment preset` грузит HDR-файл с CDN в
рантайме. Рецепт: `ThreeCanvas` (`@remotion/three`), вращения —
`frame/fps * k`; `Float` заменить своей синусоидой по кадру;
`MeshDistortMaterial` — передавать `time` через свой шейдер или
отказаться; частицы — `random(seed)`; HDR положить локально
(`Environment files={staticFile(...)}`) + `delayRender`.

## Паттерны

`abstract-concepts`, `spatial`
