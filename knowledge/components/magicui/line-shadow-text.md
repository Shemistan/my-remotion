# LineShadowText — `magicui/line-shadow-text`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Крупный заголовок с «штрихованной» тенью: под текстом со сдвигом 0.04em
лежит копия из диагональных полосок, полоски медленно ползут.

## Когда использовать

Заголовок сцены в стиле ретро-постера, акцент на одном слове («Быстрее»,
«Remotion»). Не для длинных фраз и мелкого кегля — штриховка 0.06em
пропадает.

## Фразы из озвучки

- «и вот главное слово этого года»
- «встречайте — новая версия»
- «запомните это название»

## Визуальный стиль

Плоский типографский, графичный, «печатный». Цвет тени — `shadowColor`,
темп очень медленный (15 с на цикл).

## Входные данные

- `children: string` (обязателен — копируется в `data-text` для `::after`)
- `shadowColor?: string` = `"black"`
- `as?: "article"|"div"|"h1"…"h6"|"li"|"p"|"section"|"span"` = `"span"`
- `className`, остальные `MotionProps` пробрасываются в `motion.*`.

## Анимации

`::after` с фоном `linear-gradient(45deg, …)` размером `0.06em`,
`bg-clip-text`, класс `after:animate-line-shadow` →
`@keyframes line-shadow` (`background-position: 0 0 → 100% -100%`),
`15s linear infinite`. Сам `motion`-элемент по умолчанию не анимируется.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/line-shadow-text.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `cssVars`/`@keyframes line-shadow`
- `templates/react-libriry/magicui/apps/www/content/docs/components/line-shadow-text.mdx` — документация

## Зависимости

`motion` (`motion/react`), Tailwind v4 (утилиты `after:*`, `bg-size-*`),
`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`. Keyframes живут на псевдоэлементе, поэтому inline
`animationDelay` до него не достаёт. Проще заменить `::after` на явный
`<span aria-hidden>` с тем же фоном и задавать `backgroundPosition`
из кадра: `p = (frame/fps % 15)/15` → `${p*100}% ${-p*100}%`. `motion.*`
можно заменить обычным тегом.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
