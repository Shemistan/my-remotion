# Globe — `motion-primitives-website/globe`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | complex |
| Флаги | `engine:three`, `webgl`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Вращающийся 3D-глобус: `wireframe` — каркасная сфера с двумя
наклонёнными кольцами-орбитами; `dotted` — сфера из 200 точек
(спираль Фибоначчи) с 5 светящимися дугами-связями над поверхностью.

## Когда использовать

Глобальный охват, международные офисы/клиенты, «связываем весь мир»,
сеть доставки, геораспределённая инфраструктура.

## Фразы из озвучки

- «наши клиенты — по всему миру»
- «работаем в 40 странах»
- «связываем людей на разных континентах»

## Визуальный стиль

Цвет по умолчанию `#8B5CF6`, полупрозрачные материалы (`meshBasic`,
opacity 0.05–0.6), точки белые; камера `[0,0,6]`, fov 45.

## Входные данные

`GlobeProps`: `variant?: 'wireframe'|'dotted'` (`'wireframe'`); `color?`
(`'#8B5CF6'`); `interactive?` (true — `OrbitControls` с `autoRotate`);
`className?`. Подсцены экспортируются: `WireframeGlobe`, `DottedGlobe`
(`color`, `dotColor`, `rotationSpeed` 0.001, `radius` 2).

## Анимации

`useFrame`: `rotation.y += rotationSpeed` (накопление за кадр браузера),
кольца `rotation.z += speed*0.5`; `OrbitControls autoRotate` 0.5 —
перетаскивание мышью.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/three/globe.tsx` — компонент
- `templates/react-libriry/motion-primitives-website/src/lib/component-registry.ts` — запись «Globe»

## Зависимости

`@react-three/fiber`, `@react-three/drei` (`OrbitControls`), `three`,
`@/lib/utils`.

## Совместимость и адаптация

`complex`: накопительное вращение в `useFrame`, `OrbitControls`, дуги
dotted — `Math.random`. Рецепт: `ThreeCanvas` из `@remotion/three`,
`interactive={false}`; `rotation.y = frame * rotationSpeed * (60/fps)`
вычислять в рендере; выбор концов дуг — `random(\`arc-${i}\`)` из
remotion; появление дуг — `tubeGeometry` по срезу точек от кадра.

## Паттерны

`spatial`, `relationships`, `quantities`
