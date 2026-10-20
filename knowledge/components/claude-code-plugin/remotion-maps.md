# Plugin skill remotion-maps — `claude-code-plugin/remotion-maps`

| Поле | Значение |
|---|---|
| Репозиторий | `claude-code-plugin` (`official_skills/claude-code-plugin`) |
| Вид | doc |
| Категория | `knowledge-docs` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (`.claude-plugin/plugin.json`; файла LICENSE нет) |

## Что визуализирует

Не рисует; документ о картах: развилка по техникам (static map, Mapbox,
MapLibre, MapTiler, CesiumJS) с их `TECHNIQUE.md` и references.

## Когда использовать

География в озвучке при работе через плагин. Техники подробно —
`remotion-skills/maps-static`, `remotion-skills/maps-mapbox`,
`remotion-skills/maps-maplibre`, `remotion-skills/maps-maptiler`,
`remotion-skills/maps-cesium`.

**Внимание:** в плагине нет `.tsx`-ассетов, на которые ссылаются
`TECHNIQUE.md` (проверены отсутствующими: `cesium/assets/CesiumFlythrough.tsx`,
`cesium/assets/example-Root.tsx`, `maptiler/assets/RiverReveal.tsx`,
`maptiler/assets/CountryLabel.tsx`); `.ts`-файлы (`flight-path.ts`,
`tokens.ts`) на месте. Готовые компоненты брать из `remotion-skills`:
`remotion-skills/cesium-flythrough`, `remotion-skills/river-reveal`,
`remotion-skills/country-label`.

## Фразы из озвучки

- «из Цюриха в Нью-Йорк»
- «река проходит через три страны»
- «пролетим над горами»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Прорисовка маршрута, камера `jumpTo`/фиксированная подложка, 3D-пролёт.

## Исходники и документация

- `official_skills/claude-code-plugin/skills/remotion-maps/SKILL.md`
- `official_skills/claude-code-plugin/skills/remotion-maps/techniques/cesium/TECHNIQUE.md`
- `official_skills/claude-code-plugin/skills/remotion-maps/techniques/maptiler/TECHNIQUE.md`
- `official_skills/claude-code-plugin/skills/remotion-maps/techniques/mapbox/references/render-stability.md`

## Зависимости

`mapbox-gl` / `maplibre-gl` / `@maptiler/sdk`, `@turf/turf`, CesiumJS (CDN).

## Совместимость и адаптация

Нет; документ. Зеркало `remotion-skills/remotion-maps` без `.tsx`.

## Паттерны

`spatial`
