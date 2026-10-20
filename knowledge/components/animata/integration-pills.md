# IntegrationPills — `animata/integration-pills`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Облако «таблеток»-названий сервисов (Shopify, RSS, Zapier, Slack, Webflow,
Squarespace, Twitter, TikTok, n8n, BuySellAds, Mastodon, Gumroad) в рамке;
по hover обычные уменьшаются и сереют, а три выделенные (RSS, Twitter,
Mastodon) получают цветную рамку — выделение «главных».

## Когда использовать

«Интегрируется со всем», экосистема, партнёры; и выделение 2–3 ключевых из
множества. Статичная композиция; hover воспроизвести по кадру.

## Фразы из озвучки

- «работает со всеми популярными сервисами»
- «десятки интеграций»
- «но главное — эти три»

## Визуальный стиль

Светлый, `rounded-full border-2` пилюли `text-xl`, рамка `rounded-xl
shadow-2xl`.

## Входные данные

Props нет; массив `brands` (`name`, `className`, `hoverClass`) зашит.

## Анимации

`transition-transform duration-300` по `group-hover/pills:` — `scale-75` и
серый текст у обычных; бордер/цвет у выделенных.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/integration-pills.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/integration-pills.mdx` — документация
- `templates/react-libriry/animata/animata/card/integration-pills.stories.tsx` — пример

## Зависимости

Tailwind, `@/lib/utils`.

## Совместимость и адаптация

Вынести `brands` в props; появление пилюль — stagger по кадрам; момент
«выделения» — `scale = interpolate(p, [0,1], [1, 0.75])` у обычных и цвет
рамки у выделенных.

## Паттерны

`relationships`, `key-point-emphasis`, `system-structure`
