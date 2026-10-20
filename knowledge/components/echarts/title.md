# ECharts title — `echarts/title`

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

Заголовок и подзаголовок внутри холста ECharts, с фоном, рамкой и
выравниванием.

## Когда использовать

Если весь кадр рендерит ECharts (SSR-строка). Обычно заголовок лучше
делать React-текстом Remotion — проще анимировать.

## Фразы из озвучки

- «выручка по регионам за 2025 год»
- «посмотрим на главную цифру квартала»

## Визуальный стиль

18 px bold основного цвета, подзаголовок 12 px; по центру сверху.

## Входные данные

`TitleOption`: `text`, `subtext`, `link`/`sublink`, `target`, `left`
(`'center'`), `top`, `textAlign`, `textVerticalAlign`,
`backgroundColor`, `borderColor`/`borderWidth`/`borderRadius`, `padding`
(5), `itemGap` (10), `textStyle` ({fontSize 18, fontWeight 'bold'}),
`subtextStyle` ({fontSize 12}), `triggerEvent`.

## Анимации

Собственной анимации нет.

## Исходники и документация

- `templates/infografika/echarts/src/component/title/install.ts` — модель и view
- https://echarts.apache.org/en/option.html#title

## Зависимости

`echarts`, `zrender`.

## Совместимость и адаптация

Статичен, но живёт в движке — общий рецепт
`knowledge/compatibility/echarts.md`. Появление — `textStyle.opacity`
или `top` от кадра в option; шрифт загрузить до первого кадра.

## Паттерны

`key-point-emphasis`
