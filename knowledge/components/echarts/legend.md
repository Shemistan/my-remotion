# ECharts legend — `echarts/legend`

| Поле | Значение |
|---|---|
| Репозиторий | `echarts` (`templates/infografika/echarts`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | complex |
| Флаги | `canvas`, `svg`, `raf`, `dom`, `engine:other`, `user-events` |
| Проверка | static-review |
| Лицензия | Apache-2.0 (package.json, LICENSE, NOTICE) |

## Что визуализирует

Легенда рядов: иконка формы ряда и название, горизонтально или
вертикально; неактивные пункты серые; кнопки «все/инверсия».

## Когда использовать

2+ ряда, цвета нужно расшифровать. В видео часто лучше подписать ряды
прямо (`endLabel` у line, `label`).

## Фразы из озвучки

- «синим — наш продукт, оранжевым — конкурент»
- «сравним три канала продаж»

## Визуальный стиль

Иконки `roundRect` или форма ряда, текст 12 px, `itemGap` 10.

## Входные данные

`LegendOption`: `data`, `orient`, `align` (`'auto'`), `left`/`top`,
`itemGap`, `itemWidth`, `itemHeight`, `icon`, `formatter`,
`selectedMode`, `selected` ({name: bool}), `selector`, `inactiveColor`,
`itemStyle`, `lineStyle`, `textStyle`, `backgroundColor`,
`borderRadius`, `padding`. Прокручиваемая легенда — отдельный
модуль `legendScroll` (пагинация, в видео не нужна).

## Анимации

Собственной нет; клик по пункту переключает ряд и запускает переходы
серий.

## Исходники и документация

- `templates/infografika/echarts/src/component/legend/LegendModel.ts`
- `templates/infografika/echarts/src/component/legend/LegendView.ts`
- `templates/infografika/echarts/test/legend.html`

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Общий рецепт `knowledge/compatibility/echarts.md`; `selectedMode: false`.
Показ рядов по сценарию — `legend.selected` от кадра при
`animation: false` (ряд появится скачком) или данные рядов от кадра.

## Паттерны

`comparison`
