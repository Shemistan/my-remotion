# MapLibre technique — `remotion-skills/maps-maplibre`

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

Не рисует; документ о детерминированных 2D-анимациях карт MapLibre GL JS +
Turf, без API-ключа.

## Когда использовать

Нужен бесплатный вариант; 3D-зданий нет. Правила те же, что у Mapbox:
Turf для геометрии, GeoJSON-слои, статичная камера по умолчанию,
`interactive: false`, `fadeDuration: 0`, `preserveDrawingBuffer: true`,
`delayRender` на загрузку и кадры, `jumpTo()` для кадра 0 и ожидание
`idle`, без `mapInstance.remove()`, стандартные style JSON URL, атрибуция.

## Фразы из озвучки

- «путь от точки А до точки Б»
- «отметим города на карте»
- «маршрут экспедиции»

## Визуальный стиль

Не применимо (документ).

## Входные данные

Нет (документ).

## Анимации

Прорисовка маршрута по прогрессу, камера `jumpTo`, «фиксированная
подложка» + CSS translate/scale для панорамы (render-stability).

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/maplibre/TECHNIQUE.md`
- `official_skills/skills/skills/remotion-maps/techniques/maplibre/references/render-stability.md`

## Зависимости

`maplibre-gl`, `@turf/turf`, `remotion`.

## Совместимость и адаптация

Нет; документ. Нужна сеть для тайлов выбранного провайдера и WebGL.

## Паттерны

`spatial`
