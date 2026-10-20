# RiverReveal (map explainer) — `remotion-skills/river-reveal`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-skills` (`official_skills/skills`) |
| Вид | example |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | native |
| Флаги | `webgl`, `engine:other`, `dom`, `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | не указана (нет LICENSE, нет поля license в package.json) |

## Что визуализирует

Карта-объяснялка: «электрическая» река прорисовывается с белой светящейся
головой; когда она доходит до страны, у той прорисовывается граница, затем
заливка цветом с лёгким перелётом и подпись; камера медленно панорамирует.

## Когда использовать

«Что-то проходит через несколько регионов»: река, трубопровод, торговый
путь, распространение явления. Данные зашиты как пример (река Ярлунг-Цангпо,
Китай → Индия → Бангладеш) — заменить sample-data, `ORDER` и токены.

## Фразы из озвучки

- «река берёт начало в Китае и течёт через Индию»
- «следом — Бангладеш»
- «три страны связаны одной рекой»

## Визуальный стиль

Тёмный фон `#101315`, ледяная линия реки с голубым glow, приглушённые
заливки стран (`FILL_OPACITY` 0.5), подписи капсом (`CountryLabel`).

## Входные данные

Без props (`React.FC`). Данные: `sample-data/yarlung-flow.json` (линия),
`sample-data/country-meta.json` (`{stop, anchor, border}` на страну),
`tokens.ts` (`COLORS`, `COUNTRY`, `COUNTRY_DARK`, `FILL_OPACITY`). Тайминг
в секундах: `RIVER_START` 0.3, `RIVER_END` 8.0, `BORDER_S` 2.5, `FILL_S`
1.0, `LABEL_S` 0.7; страна стартует в `RIVER_START + stop·(RIVER_END −
RIVER_START)`. Камера START→END (center/zoom). Композиция в
`example-Root.tsx`: `MapExplainer`, 12 с, 1920×1080, 30 fps.

## Анимации

- `turf.lineSliceAlong` реки по `reveal` с `Easing.bezier(0.645, 0.045, 0.355, 1)`;
- голова реки (3 % длины) и её затухание 0.5 с после конца;
- границы по сегментам (`sliceBorder`), заливка `[0, 1.25·F, F]`;
- подписи по `map.project(anchor)` × масштаб подложки;
- панорама — CSS `translate/scale` фиксированной подложки 2×.

## Исходники и документация

- `official_skills/skills/skills/remotion-maps/techniques/maptiler/assets/RiverReveal.tsx` — сцена
- `official_skills/skills/skills/remotion-maps/techniques/maptiler/assets/CountryLabel.tsx`, `tokens.ts`, `sample-data/country-meta.json`
- `official_skills/skills/skills/remotion-maps/techniques/maptiler/assets/example-Root.tsx`
- `official_skills/skills/skills/remotion-maps/techniques/maptiler/TECHNIQUE.md`, `references/map-explainer-architecture.md`

## Зависимости

`@maptiler/sdk`, `@turf/turf`, `remotion`; ключ `REMOTION_MAPTILER_KEY`.

## Совместимость и адаптация

`native`: всё вычисляется из `useCurrentFrame`, `delayRender` на загрузку и
каждый кадр (`map.once('idle')` + `triggerRepaint`). Флаги: WebGL-карта,
`map.project`/контейнер DOM, тайлы из сети. Рендер:
`bunx remotion render src/index.ts MapExplainer out.mp4 --gl=angle --concurrency=1 --timeout=120000`.

## Паттерны

`spatial`, `relationships`, `sequence-steps`, `cause-effect`
