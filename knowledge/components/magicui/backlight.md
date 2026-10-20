# Backlight — `magicui/backlight`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `media` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Подсветка «как у Ambilight»: за видео, картинкой или SVG появляется
размытое и пересыщенное цветное свечение из его же пикселей.

## Когда использовать

Подать скриншот, обложку, видеофрагмент, логотип эффектно на тёмном
фоне — «экран светится». Для неоновой рамки — `neon-gradient-card`.

## Фразы из озвучки

- «посмотрите на результат»
- «яркая картинка, которая притягивает взгляд»
- «вот так выглядит готовый продукт»

## Визуальный стиль

Gaussian blur `blur` (20) + `saturate 4`, оригинал поверх; цвет —
из самого контента.

## Входные данные

- `children?: ReactElement` (один элемент: `img`, `video`, `svg`…)
- `blur?` = `20` (`stdDeviation`), `className?`

## Анимации

Нет. SVG `filter` (`feGaussianBlur` → `feColorMatrix saturate 4` →
`feComposite over`) на обёртке; движется только то, что внутри.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/backlight.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/backlight.mdx` — документация

## Зависимости

React (`useId`).

## Совместимость и адаптация

`adaptable`, адаптации не нужны. Внутрь класть `<Img>`/`<OffthreadVideo>`
из `remotion` вместо `<img>`/`<video>`. Фильтр на большом видео
дорогой — уменьшить размер или `blur`.

## Паттерны

`key-point-emphasis`
