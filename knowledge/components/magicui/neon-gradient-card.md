# NeonGradientCard — `magicui/neon-gradient-card`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `particles-effects` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Карточка с неоновой градиентной рамкой (розовый ↔ бирюзовый) и
мощным размытым свечением вокруг; градиент медленно переливается
сверху вниз.

## Когда использовать

Главная карточка: цитата, цифра, анонс, тариф — когда нужно «неоновое»
выделение в тёмной сцене. Для тонкой рамки — `shine-border`.

## Фразы из озвучки

- «и наша главная новость»
- «вот что выделяет нас среди других»
- «неоновое будущее уже здесь»

## Визуальный стиль

`#ff00aa → #00FFF1`, рамка 2 px, радиус 20 px, glow blur = ширина/3,
opacity 0.8; фон карточки `gray-100`/`neutral-900`; цикл 3 с alternate.

## Входные данные

- `children?`, `className?`
- `borderSize?` = `2` (в JSDoc указано 5 — в коде 2), `borderRadius?` = `20`
- `neonColors?` = `{ firstColor: "#ff00aa", secondColor: "#00FFF1" }`
- `as?: ReactElement` (в типе, в разметке не используется).

## Анимации

`::before` (рамка) и `::after` (свечение с blur) с
`animate-background-position-spin` → `@keyframes
background-position-spin`: `background-position: top center → bottom
center`, `3000ms infinite alternate`. Размер — `offsetWidth/Height` +
`resize`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/neon-gradient-card.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes background-position-spin`
- `templates/react-libriry/magicui/apps/www/content/docs/components/neon-gradient-card.mdx` — документация

## Зависимости

Tailwind v4 (`before:*`, `after:*`, `blur-(--…)`), `cn`.

## Совместимость и адаптация

`adaptable`. Псевдоэлементы недоступны inline-стилю: заменить
`::before/::after` на два `div` и задавать `backgroundPosition` по
кадру (`p` треугольной волной с периодом 6 с), либо глобальное
правило с `animation-delay: var(--neg-delay)` + `paused`. Размер
измеряется после монтирования — первый кадр без свечения; задать
размеры явно.

## Паттерны

`key-point-emphasis`
