# DoubleUnderline — `animata/double-underline`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Слово с тонкой градиентной чертой снизу; по hover вторая черта
«перелетает» снизу над словом, нижняя чуть гаснет, трекинг сжимается.

## Когда использовать

Выделение термина в тексте, «подчеркнём это слово». Hover-анимацию
воспроизвести по кадру.

## Фразы из озвучки

- «обратите внимание на это слово»
- «ключевой термин»
- «подчеркну»

## Визуальный стиль

Тонкий, типографский, 500 мс `cubic-bezier(0.22,1,0.36,1)`.

## Входные данные

`React.HTMLProps<HTMLSpanElement>`: `className?`, `children`, остальное —
в `span`.

## Анимации

CSS-transition по `group-hover/underline`: верхняя черта `top: calc(100% −
3px) → −1px`, opacity 0 → 1; нижняя opacity → 0.5; letter-spacing → −0.01em.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/double-underline.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/double-underline.mdx` — документация
- `templates/react-libriry/animata/animata/text/double-underline.stories.tsx` — пример

## Зависимости

Tailwind, `@/lib/utils`.

## Совместимость и адаптация

Hover заменить прогрессом `p` из кадра: `top` верхней черты =
`interpolate(p,[0,1],[100% − 3px, −1px])`, opacity, letter-spacing — inline-стили.

## Паттерны

`key-point-emphasis`
