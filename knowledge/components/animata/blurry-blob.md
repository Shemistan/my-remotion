# BlurryBlob — `animata/blurry-blob`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Два крупных размытых цветных пятна (blur-3xl, mix-blend-multiply, opacity
45%), которые «дышат» — пульсируют масштабом.

## Когда использовать

Мягкий абстрактный фон-подложка за заголовком или цифрой; «атмосфера» без
смысловой нагрузки. Для тёмных техно-фонов лучше `animata/animated-beam`.

## Фразы из озвучки

- «давайте поговорим о главном»
- «идея, которая витает в воздухе»
- «мягкий старт: что такое…»

## Визуальный стиль

Пастельные blue-400 / purple-400 по умолчанию, сильный blur, плавная
пульсация 4 с.

## Входные данные

`BlobProps extends HTMLAttributes<div>`: `firstBlobColor: string`,
`secondBlobColor: string` — обязательные, это **Tailwind-классы** цвета
(`bg-*`), а не CSS-цвет; `className?` применяется к обоим пятнам. Пятна
позиционированы absolute с отрицательными отступами — нужен родитель с
размерами.

## Анимации

Глобальная Tailwind-утилита `animate-pop-blob` (`pop-blob 4s infinite`:
scale 1→1.2→0.8→1), объявлена в `styles/globals.css` (`@theme`).

## Исходники и документация

- `templates/react-libriry/animata/animata/background/blurry-blob.tsx` — компонент
- `templates/react-libriry/animata/styles/globals.css` — keyframes `pop-blob`
- `templates/react-libriry/animata/content/docs/background/blurry-blob.mdx` — документация
- `templates/react-libriry/animata/animata/background/blurry-blob.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`), Tailwind v4 с `--animate-pop-blob` из globals.css.

## Совместимость и адаптация

`adaptable`: заменить `animate-pop-blob` на inline `transform: scale(...)` из
`interpolate(frame % (4*fps), [0, 1.32*fps, 2.64*fps, 4*fps], [1, 1.2, 0.8, 1])`
(разные фазы для двух пятен) либо оставить keyframes с отрицательным
`animationDelay` и `paused`. Цвета передавать классами или переписать на style.

## Паттерны

`abstract-concepts`
