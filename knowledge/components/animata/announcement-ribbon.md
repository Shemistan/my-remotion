# AnnouncementRibbon — `animata/announcement-ribbon`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `layout-templates` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Жёлтая (`#ffcc00`) полоса-баннер высотой 44px: слева бейдж «NEW», в
центре бегущая строка сообщения (Marquee), справа ссылка «Learn more →».

## Когда использовать

Анонс в начале/конце ролика, «новость дня», breaking-news полоса,
напоминание о релизе. Для простой бегущей ленты — `animata/marquee`.

## Фразы из озвучки

- «у нас новость»
- «вышло большое обновление»
- «подробности — по ссылке в описании»

## Визуальный стиль

Бренд-жёлтый, тонкие разделители black/8, моно-шрифт капсом для бейджа и
CTA, светлое начертание сообщения.

## Входные данные

`message?: ReactNode` (по умолчанию «New components and live demos ·»),
`badge = "NEW"` (`null` — скрыть), `ctaText = "Learn more"` (`null` —
скрыть), `ctaHref = "/docs/changelog/2026-05"`, `repeat = 5`,
`pauseOnHover = true`, `className?`.

## Анимации

Через `Marquee` (`marquee-x`, 10 с, linear infinite); hover-сдвиг стрелки
CTA (`transition-transform`).

## Исходники и документация

- `templates/react-libriry/animata/animata/container/announcement-ribbon.tsx` — компонент
- `templates/react-libriry/animata/animata/container/marquee.tsx` — бегущая лента
- `templates/react-libriry/animata/content/docs/container/announcement-ribbon.mdx` — документация
- `templates/react-libriry/animata/animata/container/announcement-ribbon.stories.tsx` — пример

## Зависимости

`next/link`, `animata/container/marquee`, `@/lib/utils`. Шрифт
`--font-display` из сайта.

## Совместимость и адаптация

`adaptable`: заменить `next/link` на `<span>`, Marquee — по рецепту
`animata/marquee` (сдвиг из кадра). Вход полосы сверху — translateY из
`spring`.

## Паттерны

`key-point-emphasis`
