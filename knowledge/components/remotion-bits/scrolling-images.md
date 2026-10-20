# ScrollingColumns (ScrollingImages.tsx) — `remotion-bits/scrolling-images`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Несколько вертикальных колонок картинок, бесконечно прокручивающихся вверх
или вниз с разной скоростью (эффект «стены» скриншотов/работ/отзывов).
Экспорт — `ScrollingColumns`, в registry — `scrolling-columns`.

## Когда использовать

Портфолио, витрина шаблонов, «сотни клиентов уже с нами», фон из
скриншотов продукта. Для одной картинки с наездом камеры — `bit-ken-burns`;
для сетки, перестраивающейся в мозаику, — `bit-mosaic-reframe`.

## Фразы из озвучки

- «тысячи дизайнов на любой вкус»
- «нам доверяют сотни компаний»
- «посмотрите, что уже создали наши пользователи»

## Визуальный стиль

Flex-ряд колонок, картинки `object-fit: cover`, скругление 8px, фиксированная
высота каждой картинки. Спокойный непрерывный поток.

## Входные данные

`ScrollingColumnsProps`: `columns: {images: string[], speed? (100 px/с),
direction?: "up" | "down" ("up")}[]`; `height?` (300 — высота картинки;
строка парсится `parseInt`); `width?` ("100%"); `gap?` (20); `columnGap?`
(20); `className?`, `style?`, `imageStyle?`.

## Анимации

`translateY = ±((frame/fps)·speed % totalContentHeight)`; список колонки
повторяется `max(2, ceil(videoHeight/total)+1)` раз для бесшовного цикла.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/ScrollingImages.tsx` — компонент
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/particle-system/ScrollingColumns.tsx` — пример (3D-сцена с колонками)

## Зависимости

`remotion` (`useCurrentFrame`, `useVideoConfig`), внутренний
`hooks/useViewportRect` (импортирован, не используется).

## Совместимость и адаптация

`native` по движению. Картинки выводятся обычным `<img>`, а не `Img` из
`remotion` — рендер не ждёт загрузки, первые кадры могут быть пустыми:
заменить на `<Img>` и `staticFile()` для локальных файлов. Справочной mdx
для компонента нет.

## Паттерны

`quantities`, `comparison`
