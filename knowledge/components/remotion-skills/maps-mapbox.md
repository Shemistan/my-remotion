# Mapbox technique — `remotion-skills/maps-mapbox`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Не рисует; документ о детерминированных 2D-анимациях карт Mapbox GL JS +
Turf с полным примером маршрута Цюрих — Нью-Йорк.

## Когда использовать

Есть токен Mapbox (`REMOTION_MAPBOX_TOKEN`) и нужны его стили
(`mapbox://styles/mapbox/standard`). Правила: геометрия — `@turf/turf`;
линии/маркеры/подписи — GeoJSON-слоями, не DOM-маркерами; камера по
умолчанию статична, движение — только после проверки на шимер
(render-stability); `interactive: false`, `fadeDuration: 0`,
`preserveDrawingBuffer: true`; `delayRender` вокруг загрузки и каждого
кадра, `map.once('idle')` + `triggerRepaint()`; без `map.remove()`;
атрибуция видима. Координаты `[lng, lat]`.

## Фразы из озвучки

- «маршрут прорисовывается от города к городу»
- «самолёт летит через океан»
- «камера следует за линией пути»

## Визуальный стиль

Описываемый визуал: чёрная линия маршрута 7px, красные точки городов с
белой обводкой, подписи 28px с белым ореолом.

## Входные данные

Нет (документ).

## Анимации

`turf.greatCircle` → `lineSliceAlong` по прогрессу; камера `jumpTo` с
`zoom` 7→2.4→8, `bearing` −20→35, `pitch` 25→55→30 через `interpolate` с
`Easing.bezier(0.645, 0.045, 0.355, 1)`.

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/mapbox/TECHNIQUE.md`
- `official_skills/skills/skills/remotion-maps/techniques/mapbox/references/render-stability.md` — «фиксированная подложка» против дрожания

## Зависимости

`mapbox-gl`, `@turf/turf`, `remotion`.

## Совместимость и адаптация

Нет; документ. Рендер: `--gl=angle --concurrency=1`; нужна сеть.

## Паттерны

`spatial`, `sequence-steps`
