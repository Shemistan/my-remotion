# Marimekko — `nivo/marimekko`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | chart-type |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other`, `engine:d3`, `raf`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, package.json) |

## Что визуализирует

Mosaic-диаграмма (Marimekko): столбцы переменной ширины (первое
измерение — размер сегмента), внутри каждого — стопка долей (второе
измерение). Как у stream, поддерживаются offset `expand`/`diverging`.

## Когда использовать

Две оси долей сразу: размер рынков и доля игроков в каждом, структура
выручки по регионам и продуктам. Для одной оси долей — stacked `nivo/bar`.

## Фразы из озвучки

- «самый большой рынок — Азия, и там мы занимаем треть»
- «в маленьких сегментах конкуренция сильнее»
- «соотнесём размер каждого рынка с нашей долей»

## Визуальный стиль

Плотная «плитка» прямоугольников без зазоров или с `innerPadding`,
категориальная палитра, оси с процентами. Консалтинговый стиль.

## Входные данные

`MarimekkoSvgProps` (`types.ts`): `data: Datum[]`, `id` (ключ или функция),
`value` (ширина столбца), `dimensions: {id, value}[]` (части стопки),
`width`, `height`, `margin`, `layout` vertical|horizontal, `offset`
(`expand`, `diverging`, `none`, `silouhette`, `wiggle` — `offsetById`),
`outerPadding`, `innerPadding`, `axisTop/Right/Bottom/Left`,
`enableGridX/Y`, `gridXValues/gridYValues`, `colors`, `borderWidth`,
`borderColor`, `legends`, `layers` + custom, `valueFormat`, `defs/fill`,
`animate`, `motionConfig`, `isInteractive`.

## Анимации

Бары (`Bars.tsx`) анимируются react-spring по `MotionProps`.

## Исходники и документация

- `templates/infografika/nivo/packages/marimekko/src/Marimekko.tsx`, `types.ts`
- `templates/infografika/nivo/website/src/data/components/marimekko/meta.yml`
- `templates/infografika/nivo/storybook/stories/marimekko/Marimekko.stories.tsx`

## Зависимости

`@nivo/marimekko`, `@nivo/core`, `@nivo/axes`, `@nivo/legends`, `@react-spring/web`, `d3-shape`.

## Совместимость и адаптация

`adaptable`: `animate={false}`, `isInteractive={false}`, явные размеры.
Появление — `clip-path` слева направо или поочерёдная `opacity`
столбцов в custom layer. Масштабирование значений при `offset: 'expand'`
ничего не меняет: доли нормированы.

## Паттерны

`comparison`, `quantities`
