# CesiumFlythrough — `remotion-skills/cesium-flythrough`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | component |
| Категория | `3d-camera` |
| Совместимость с Remotion | native |
| Флаги | `webgl`, `engine:other`, `dom`, `timers`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Полноэкранный 3D-пролёт камеры над реальной местностью (рельеф + спутник)
или фотореалистичным городом по маршруту, с упреждающим взглядом и
креном в поворотах. В режиме `city` — плашка «For promotional purposes only»
в правом верхнем углу.

## Когда использовать

Место, путешествие, ландшафт, маршрут реки, город с высоты. Схематичный
маршрут на плоской карте — `remotion-skills/maps-mapbox`; просто «где это» —
`remotion-skills/maps-static`. Нужны ключи и сеть.

## Фразы из озвучки

- «пролетим над долиной реки»
- «с высоты видно весь город»
- «маршрут уходит в горы»

## Визуальный стиль

Кинематографичный фотореализм, атмосфера и туман Cesium, постоянная
скорость, лёгкий крен (до 0.13 рад).

## Входные данные

`CesiumFlythroughProps`:

- `mode?: 'landscape' | 'city'` (`'landscape'`);
- `path?: [lng, lat][]` (`cesium-path.json`), `pathSmoothingPasses?` (3);
- `altitudeStart?` (4600), `altitudeEnd?` (4300) — метры;
- `lookAheadKm?` (1.5), `travelKm?` (13);
- `pitchFromNadir?` (76), `verticalExaggeration?` (1.1),
  `maximumScreenSpaceError?` (8).

Env: `REMOTION_MAPTILER_KEY` (landscape), `REMOTION_GOOGLE_MAPS_API_KEY`
(city). Пример city в `example-Root.tsx`: высоты 700→500, `lookAheadKm`
0.7, `travelKm` 4.5, `pitchFromNadir` 72, 18 с.

## Анимации

Прогресс `frame / (durationInFrames - 1)` → точка на сглаженной
(Chaikin) кривой по дуговой длине; высота `lerp`; heading на точку через
`lookAheadKm`, roll от разницы курсов × 0.6.

```tsx
viewer.camera.setView({ destination: C.Cartesian3.fromDegrees(lng, lat, lerp(altitudeStart, altitudeEnd, progress)),
  orientation: { heading, pitch: C.Math.toRadians(-(90 - pitchFromNadir)), roll } });
```

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/cesium/assets/CesiumFlythrough.tsx` — компонент
- `official_skills/skills/skills/remotion-maps/techniques/cesium/assets/flight-path.ts` — `smoothFlightPath`
- `official_skills/skills/skills/remotion-maps/techniques/cesium/assets/example-Root.tsx` — композиции LandscapeFlyover (24 с) и CityFlyover
- `official_skills/skills/skills/remotion-maps/techniques/cesium/TECHNIQUE.md`

## Зависимости

`remotion`; CesiumJS 1.143 скриптом с `cesium.com` CDN; тайлы MapTiler /
Google Map Tiles API.

## Совместимость и адаптация

`native`: написан для Remotion — `useCurrentFrame`, `delayRender`
(120 с на инициализацию, 60 с на кадр) и `continueRender` после `settle()`.
Флаги фиксируют то, что придётся обеспечить: загрузка скрипта и CSS через
`document.head`, `window.Cesium`; `settle()` опрашивает `tilesLoaded`
через `setTimeout(8)`; WebGL (`preserveDrawingBuffer`, рендер `--gl=angle`);
внешние сервисы. City-режим кидает ошибку при длительности > 30 с.

## Паттерны

`spatial`, `timeline`
