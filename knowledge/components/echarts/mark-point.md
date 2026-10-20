# ECharts markPoint — `echarts/mark-point`

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

Маркер-«булавка» на ряду в точке max/min/average/median или в
заданной координате, с подписью значения внутри.

## Когда использовать

Ткнуть в рекорд, минимум, событие. Порог — `echarts/mark-line`,
период — `echarts/mark-area`.

## Фразы из озвучки

- «вот он, исторический максимум»
- «в этой точке тренд развернулся»
- «минимум пришёлся на февраль»

## Визуальный стиль

Капля `pin` 50 px цвета ряда с цифрой внутри, `borderWidth` 2.

## Входные данные

`series[i].markPoint` (`MarkPointOption`): `data` ([{name, type
('max'|'min'|'average'|'median'), coord, xAxis/yAxis, x/y, relativeTo,
value, valueIndex, valueDim, symbol, symbolSize, itemStyle, label}]),
`symbol` (`'pin'`), `symbolSize` (50), `symbolRotate`, `symbolOffset`,
`label` ({position 'inside'}), `itemStyle`, `precision`, `silent`,
`animation*` (`AnimationOptionMixin`).

## Анимации

Вход символа по общим `animation*` маркера.

## Исходники и документация

- `templates/infografika/echarts/src/component/marker/MarkPointModel.ts`
- `templates/infografika/echarts/src/component/marker/MarkerModel.ts` — позиционирование
- `templates/infografika/echarts/src/component/marker/MarkPointView.ts`
- `templates/infografika/echarts/test/markPoint.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`; `animation: false`;
«выстрел» маркера — `symbolSize` от `spring(frame)` в option. `type:
'max'` считается по текущим (анимированным) данным — задавать `coord`
явно.

## Паттерны

`key-point-emphasis`
