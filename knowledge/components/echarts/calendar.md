# ECharts calendar — `echarts/calendar`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Календарная сетка дней (как вклад на GitHub): недели × дни за год, месяц
или диапазон, подписи дней, месяцев и года; координатная система для
`heatmap`/`scatter`/`effectScatter` по датам.

## Когда использовать

Активность по дням года, привычки, коммиты, продажи по датам. Помесячно
без дней — `echarts/bar`, `echarts/line`.

## Фразы из озвучки

- «почти каждый день в году мы что-то выпускали»
- «самые активные недели — перед праздниками»
- «год в одной картинке»

## Визуальный стиль

Сетка квадратных ячеек, линии-разделители месяцев `splitLine`, мелкие
подписи; минималистичный.

## Входные данные

`CalendarOption`: `range` (2017 | '2017-02' | [start, end]), `cellSize`
(число | 'auto' | массив), `orient`, `splitLine` ({show, lineStyle}),
`itemStyle`, `dayLabel` ({firstDay, margin, position, nameMap}),
`monthLabel` ({margin, position, nameMap, formatter}), `yearLabel`
({margin, position, formatter}), `left/top/right/bottom`. Ряды —
`coordinateSystem: 'calendar'`.

## Анимации

Собственной нет; ряды поверх анимируются по-своему.

## Исходники и документация

- `templates/infografika/echarts/src/coord/calendar/CalendarModel.ts` — опции
- `templates/infografika/echarts/src/component/calendar/CalendarView.ts`
- `templates/infografika/echarts/test/calendar.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`; заполнение дней по
кадру — данные `heatmap` до текущей даты при фиксированном
`visualMap`. `nameMap` дней/месяцев по умолчанию берётся из `locale`
инстанса — задать явно.

## Паттерны

`timeline`, `quantities`
