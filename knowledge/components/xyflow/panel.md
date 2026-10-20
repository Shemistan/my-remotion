# Panel — `xyflow/panel`

| Поле | Значение |
|---|---|
| Репозиторий | `xyflow` (`templates/infografika/xyflow`) |
| Вид | component |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, packages/react/package.json) |

## Что визуализирует

Абсолютно позиционированный `div` поверх холста в одном из шести мест
(`top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`,
`bottom-right`) с отступом 15px; не двигается вместе с viewport.
Внутри — заголовок схемы, легенда, подпись этапа.

## Когда использовать

Неподвижный титр или легенда поверх схемы, по которой ездит камера.
Если элемент должен жить в координатах схемы и масштабироваться с ней —
`ViewportPortal` (портал в `.react-flow__viewport-portal`, см. карточку
`xyflow/react-flow`).

## Фразы из озвучки

- «синим отмечены внутренние сервисы, серым — внешние»
- «этап первый: сбор данных»

## Визуальный стиль

Без оформления; `z-index: 5`, `margin: 15px`; `center`-варианты
центрируются `translateX(-50%)`/`translateY(-50%)`.

## Входные данные

`PanelProps`: `position` (`'top-left'`; `PanelPosition`), `children`,
`className`, `style` + любые HTML-атрибуты `div`.

## Анимации

Нет.

## Исходники и документация

- `templates/infografika/xyflow/packages/react/src/components/Panel/index.tsx`
- `templates/infografika/xyflow/packages/system/src/styles/init.css` — `.xy-flow__panel`
- https://reactflow.dev/api-reference/components/panel

## Зависимости

`@xyflow/react`, `classcat`.

## Совместимость и адаптация

`adaptable`: обычный `div` без store, измерений и анимаций; появление —
`style.opacity`/`transform` от кадра (у `center`-позиций `transform`
занят CSS-центровкой — анимировать вложенный элемент). Вне холста смысла
нет — проще свой `AbsoluteFill`.

## Паттерны

`key-point-emphasis`, `system-structure`
