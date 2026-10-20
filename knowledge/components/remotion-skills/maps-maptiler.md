# MapTiler technique — `remotion-skills/maps-maptiler`

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

Не рисует; документ о картах-объяснялках на MapTiler SDK: аннотации поверх
географии (границы, реки, подписи стран).

## Когда использовать

Сюжет, где на карте последовательно появляются линии и регионы. Источник
каждого элемента: вектор MapTiler Planet (фильтр по `source-layer`), свой
GeoJSON или гибрид; для прорисовки «от начала к концу» — запечь линию в
упорядоченный GeoJSON (`scripts/prep-geo.mjs`). Обновлять `setData`/
`setPaintProperty` по кадру; **не** вызывать `map.jumpTo()` каждый кадр при
движущейся камере — шимер; панорама — фиксированной подложкой. Подписи —
`<Interactive.Div>`. Не передавать `filter: undefined` в слой. Убрать
`symbol`-слои и внутренние границы.

## Фразы из озвучки

- «река проходит через три страны»
- «границы прорисовываются одна за другой»
- «страна заливается цветом»

## Визуальный стиль

Не применимо (документ); эталон — `remotion-skills/river-reveal`.

## Входные данные

Нет (документ).

## Анимации

`turf.lineSliceAlong(line, 0, lineKm*reveal)`, заливки через paint, подписи
по `map.project`, CSS-трансформ подложки.

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/maptiler/TECHNIQUE.md`
- `…/maptiler/references/map-explainer-architecture.md` — модель тайминга
- `…/maptiler/references/map-data-sources.md` — вектор vs GeoJSON
- `…/maptiler/references/map-geo-prep.md` — очистка подложки, подготовка гео
- `…/maptiler/references/render-stability.md` — стабильный рендер
- `…/maptiler/assets/` — `RiverReveal.tsx`, `CountryLabel.tsx`, `MapTilerVectorElement.ts`, `tokens.ts`, `example-Root.tsx`

## Зависимости

`@maptiler/sdk`, `@turf/turf`, `remotion`.

## Совместимость и адаптация

Нет; документ. Ключ `REMOTION_MAPTILER_KEY`, WebGL, сеть.

## Паттерны

`spatial`, `relationships`
