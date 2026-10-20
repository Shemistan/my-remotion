# @nivo/static — `nivo/static`

| Поле | Значение |
|---|---|
| Репозиторий | `nivo` (`templates/infografika/nivo`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:d3` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md, packages/static/package.json) |

## Что визуализирует

Собственной картинки нет. Это серверный рендер графиков nivo в строку
SVG: `renderChart({type, props}, override)` →
`'<?xml version="1.0" ?>' + renderToStaticMarkup(...)`.

## Когда использовать

- Заранее, в Node, сгенерировать SVG графика: в скрипте сборки или в
  `calculateMetadata`. Потом показать как картинку
  (`<Img src={staticFile('chart.svg')}>`) и анимировать обёрткой (маска,
  наезд, появление).
- Как доказательство, что nivo с `animate: false` даёт итоговую картинку
  синхронно на первом рендере. На этом держится весь рецепт для Remotion.

Не подходит для покадровой анимации данных: проще рендерить сам компонент
в композиции.

## Фразы из озвучки

- «вот итоговый график за год» (статичный кадр)
- «посмотрим на картину целиком» (готовая схема крупным планом)
- «вернёмся к этому графику ещё раз» (повтор одной картинки)

## Визуальный стиль

Тот же, что у исходного графика; `theme: {}` по умолчанию.

## Входные данные

`renderChart({type, props}, override)` (`renderer.ts`). `type` — ключ
`chartsMapping`: `bar, circle_packing, calendar, chord, heatmap, icicle,
line, pie, radar, sankey, sunburst, treemap` (`mappings/index.ts`);
`props` — props этого графика. Из `override` берутся только
`runtimeProps` маппинга. Всегда подставляются `animate: false,
isInteractive: false, renderWrapper: false, theme: {}`. Экспорт `samples`
— демо-данные.

## Анимации

Нет: рендер статичный.

## Исходники и документация

- `templates/infografika/nivo/packages/static/src/renderer.ts` — `renderChart`
- `templates/infografika/nivo/packages/static/src/mappings/index.ts` — поддерживаемые типы
- `templates/infografika/nivo/packages/static/src/index.ts`, `packages/static/package.json`

## Зависимости

`@nivo/static`, `react-dom/server` (peer `react-dom`), `joi` (есть в
зависимостях пакета), пакеты графиков из списка выше.

## Совместимость и адаптация

`adaptable`: в браузерной композиции Remotion `react-dom/server` не
нужен. Использовать в Node-скрипте или в `calculateMetadata`, а результат
сохранить файлом или передать строкой в props
(`dangerouslySetInnerHTML`). Анимация — только поверх готового SVG.

## Паттерны

`key-point-emphasis`
