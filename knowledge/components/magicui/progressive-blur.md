# ProgressiveBlur — `magicui/progressive-blur`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Полоса у верхнего/нижнего края, где содержимое под ней постепенно
размывается всё сильнее (8 ступеней `backdrop-filter` с масками) —
мягкий край вместо обрезки.

## Когда использовать

Над прокручивающимся списком, лентой отзывов, marquee — чтобы контент
красиво «уходил» в край кадра. Сам по себе ничего не показывает.

## Фразы из озвучки

- «и это ещё далеко не всё»
- «список можно продолжать бесконечно»
- «за кадром — ещё десятки примеров»

## Визуальный стиль

Плавное нарастание blur 0.5 → 64 px по высоте (по умолчанию 30 %);
«стеклянный» iOS-стиль.

## Входные данные

- `height?` = `"30%"`, `position?: "top"|"bottom"|"both"` = `"bottom"`
- `blurLevels?` = `[0.5, 1, 2, 4, 8, 16, 32, 64]`
- `className?`; `children?` объявлен в типе, но не рендерится.

## Анимации

Нет. Слои `div` с `backdropFilter: blur(n)` и `maskImage:
linear-gradient(...)` со ступенью 12.5 %.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/progressive-blur.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/progressive-blur.mdx` — документация

## Зависимости

React, `cn`.

## Совместимость и адаптация

`adaptable`, адаптации не нужны. `backdrop-filter` в headless Chrome
работает, но 8 полноширинных слоёв с blur до 64 px заметно замедляют
рендер — при необходимости сократить `blurLevels`.

## Паттерны

`sequence-steps`, `spatial`
