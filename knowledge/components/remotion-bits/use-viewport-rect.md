# useViewportRect — `remotion-bits/use-viewport-rect`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | hook |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Ничего не рисует; возвращает прямоугольник кадра композиции (`Rect`) с
единицами `vw`, `vh`, `vmin`, `vmax`, центром `cx/cy` — чтобы верстать
сцены резиновыми под любое разрешение.

## Когда использовать

Любая сцена, которая должна одинаково выглядеть в 1920×1080, 1080×1920 и 4K:
размеры шрифтов, отступов, позиции частиц и шагов 3D. Используют почти все
bits этого репозитория.

## Фразы из озвучки

Нужен косвенно — под любую реплику, где сцена рендерится в нескольких
форматах:
- «этот же ролик — для сторис и для YouTube»
- «заголовок по центру экрана»
- «частицы разлетаются из центра»

## Визуальный стиль

Нет.

## Входные данные

Без аргументов. Возвращает `Rect` (`width`, `height`, `x=0`, `y=0`, геттеры
`left top right bottom cx cy center vw vh vmin vmax`).

## Анимации

Нет; мемоизация по `width/height` из `useVideoConfig()`.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/hooks/useViewportRect.ts` — хук
- `templates/remotion-components/remotion-bits/src/utils/geometry.ts` — `Rect`, `createRect`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/use-viewport-rect.mdx` — справка

## Зависимости

`remotion` (`useVideoConfig`), `react` (`useMemo`), внутренний `utils/geometry`
(тянет `three` ради `Vector3` в `Rect3D`).

## Совместимость и адаптация

`native`. Работает только внутри композиции (нужен `useVideoConfig`).

## Паттерны

нет
