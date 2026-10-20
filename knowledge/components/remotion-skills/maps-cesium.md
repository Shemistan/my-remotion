# CesiumJS 3D flyover technique — `remotion-skills/maps-cesium`

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

Не рисует; документ о 3D-пролётах «как в авиасимуляторе» на CesiumJS.

## Когда использовать

Пролёт над горами, ущельем, рекой (`landscape`: рельеф MapTiler
terrain-quantized-mesh-v2 + satellite-v2, ключ `REMOTION_MAPTILER_KEY`) или
городом (`city`: Google Photorealistic 3D Tiles, ключ
`REMOTION_GOOGLE_MAPS_API_KEY`, не дольше 30 с). Маршрут — немного опорных
точек `[lng, lat][]`; `pathSmoothingPasses` 3 (4 мягче, 2 строже);
абсолютные высоты; сначала still среднего кадра. Механика:
`useDefaultRenderLoop = false`, `viewer.render()`, `preserveDrawingBuffer`,
`delayRender` на инициализацию и каждый кадр, ожидание `tilesLoaded`,
атрибуция. Экструзии зданий для городов не использовать.

## Фразы из озвучки

- «пролетим над горным хребтом»
- «с высоты птичьего полёта»
- «над крышами старого города»

## Визуальный стиль

Не применимо (документ); эталон — `remotion-skills/cesium-flythrough`.

## Входные данные

Нет (документ).

## Анимации

Камера по дуговой длине сглаженной кривой, прицел на точку впереди, крен от
изменения курса.

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/cesium/TECHNIQUE.md`
- `…/cesium/references/3d-flyover-architecture.md` — математика камеры
- `…/cesium/references/3d-data-sources.md` — провайдеры
- `…/cesium/references/3d-troubleshooting.md` — пустые/грубые/таймаут-рендеры
- `…/cesium/assets/` — `CesiumFlythrough.tsx`, `flight-path.ts`, `example-Root.tsx`, пути JSON; `scripts/prep-cesium-path.mjs`

## Зависимости

CesiumJS (CDN), `remotion`.

## Совместимость и адаптация

Нет; документ.

## Паттерны

`spatial`
