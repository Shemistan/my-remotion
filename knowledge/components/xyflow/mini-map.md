# MiniMap — `xyflow/mini-map`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `interactive-widgets` |
| Совместимость с Remotion | unsuitable |
| Флаги | `svg`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Миниатюра всего графа в углу холста: прямоугольники узлов в SVG и маска,
выделяющая текущую видимую область viewport.

## Когда использовать

Навигационный виджет редактора: смысл — кликать и тащить видимую
область. В видео почти не нужен. Допустимо как статичный элемент «мы
сейчас здесь» при движении камеры по большой схеме — тогда маска
сдвигается сама, потому что читает `transform` из store.

## Фразы из озвучки

- «это лишь небольшой фрагмент всей схемы»
- «мы сейчас смотрим на правый верхний угол системы»

## Визуальный стиль

Белая плашка 200×150, серые прямоугольники узлов `#e2e2e2`, полупрозрачная
маска `rgba(240,240,240,0.6)`.

## Входные данные

`MiniMapProps`: `style` (`width`/`height` задают размер, по умолчанию
200×150), `nodeColor`, `nodeStrokeColor`, `nodeClassName`,
`nodeBorderRadius` (5), `nodeStrokeWidth`, `nodeComponent`, `bgColor`,
`maskColor`, `maskStrokeColor`, `maskStrokeWidth`, `position`
(`'bottom-right'`), `onClick`, `onNodeClick`, `pannable` (false),
`zoomable` (false), `inversePan`, `zoomStep` (1), `offsetScale` (5),
`ariaLabel`.

## Анимации

Нет; маска следует за viewport.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/additional-components/MiniMap/MiniMap.tsx`
- `templates/infografika/xyflow/packages/react/src/additional-components/MiniMap/MiniMapNodes.tsx`
- https://reactflow.dev/api-reference/components/minimap

## Зависимости

`@xyflow/react`, `XYMinimap` из `@xyflow/system` (pan/zoom по миникарте).

## Совместимость и адаптация

`unsuitable`: компонент — элемент управления. Рисуется детерминированно
(SVG из store), поэтому если всё же нужен — положить внутрь холста без
`pannable`/`zoomable`/обработчиков; размеры узлов берутся из замеров,
так что задавайте узлам `width`/`height`.

## Паттерны

`spatial`
