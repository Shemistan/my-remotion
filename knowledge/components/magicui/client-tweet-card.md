# ClientTweetCard — `magicui/client-tweet-card`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `async-data`, `external-service` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Та же карточка поста X/Twitter, что `tweet-card`, но данные грузятся
на клиенте хуком `useTweet`; пока грузится — скелетон.

## Когда использовать

Как `magicui/tweet-card`; отдельная запись нужна только потому, что
это отдельный компонент реестра. Для видео выбирать `MagicTweet` с
сохранёнными данными.

## Фразы из озвучки

- «вот что пишут о нас в соцсетях»
- «пост, который набрал тысячи лайков»
- «отзывы появляются каждый день»

## Визуальный стиль

Идентичен `tweet-card` (рендерит `MagicTweet`).

## Входные данные

`TweetProps` из `react-tweet`: `id`, `apiUrl?`, `fallback?` =
`<TweetSkeleton />`, `components?`, `fetchOptions?`, `onError?`;
`className?`.

## Анимации

Нет. `useTweet(id, apiUrl, fetchOptions)` → `isLoading` → скелетон,
ошибка → `TweetNotFound`, иначе `MagicTweet`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/client-tweet-card.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/magicui/tweet-card.tsx` — `MagicTweet` и вспомогательные части
- `templates/react-libriry/magicui/apps/www/content/docs/components/tweet-card.mdx` — документация (отдельной страницы нет)

## Зависимости

`react-tweet` (`useTweet`), `magicui/tweet-card`.

## Совместимость и адаптация

`adaptable` только через замену источника данных: клиентский
`fetch` во время рендера не синхронизирован с кадрами (первые кадры —
скелетон). Либо обернуть загрузку в `delayRender`/`continueRender`,
либо (надёжнее) сохранить JSON заранее и рендерить `MagicTweet`.
Картинки — `staticFile`.

## Паттерны

`key-point-emphasis`, `relationships`
