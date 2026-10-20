# Controls — `xyflow/controls`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `interactive-widgets` |
| Совместимость с Remotion | unsuitable |
| Флаги | `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Колонка (или строка) кнопок в углу холста: zoom in, zoom out, fit view,
замок интерактивности.

## Когда использовать

Не для видео: кнопки вызывают `zoomIn`/`zoomOut`/`fitView` по клику. В
ролике про сам редактор схем можно показать как статичную часть
интерфейса, но курсор и нажатия придётся имитировать отдельно.

## Фразы из озвучки

- «в редакторе можно приблизить любой участок схемы»
- «одна кнопка — и вся схема помещается на экран»

## Визуальный стиль

Кнопки 26×26, иконки 12px, светлый фон `#fefefe`, тень
`0 0 2px 1px rgba(0,0,0,0.08)`.

## Входные данные

`ControlProps`: `showZoom` (true), `showFitView` (true),
`showInteractive` (true), `fitViewOptions`, `onZoomIn`, `onZoomOut`,
`onFitView`, `onInteractiveChange`, `position` (`'bottom-left'`),
`orientation` (`'vertical'`), `style`, `className`, `children`,
`aria-label`.

## Анимации

Нет собственных; `zoomIn`/`fitView` анимируют viewport через d3-zoom по
клику.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/additional-components/Controls/Controls.tsx`
- https://reactflow.dev/api-reference/components/controls

## Зависимости

`@xyflow/react` (`useReactFlow`, `Panel`).

## Совместимость и адаптация

`unsuitable`: смысл компонента — клики. В видео камеру двигать через
`viewport` от кадра, а не через эти кнопки.

## Паттерны

`spatial`
