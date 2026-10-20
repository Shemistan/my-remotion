# TweetCard / MagicTweet — `magicui/tweet-card`

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

Карточка поста X/Twitter: аватар, имя с галочкой, @handle, иконка
X, текст с подсвеченными ссылками/хэштегами, фото или видео поста.

## Когда использовать

Цитата реального отзыва или реакции из соцсети, «о нас пишут»,
стена отзывов. Для выдуманного отзыва — обычная карточка
(не имитировать реальные аккаунты).

## Фразы из озвучки

- «вот что пишут о нас в соцсетях»
- «реакция не заставила себя ждать»
- «пользователи делятся впечатлениями»

## Визуальный стиль

Карточка `max-w-lg`, `rounded-xl border p-5`, аватар 48 px, текст
15 px; нейтральная тема shadcn (`text-foreground`/`muted-foreground`).

## Входные данные

- `TweetCard` (async server component): `id` (tweet id), `components?`,
  `fallback?` = `<TweetSkeleton />`, `onError?`, `className?`
- `MagicTweet`: `tweet: Tweet` (объект `react-tweet/api`), `className?`
- Экспортируются также `TweetHeader`, `TweetBody`, `TweetMedia`,
  `TweetSkeleton`, `TweetNotFound`, `truncate`.

## Анимации

Нет. Видео поста — `<video autoPlay loop muted>`. Данные —
`await getTweet(id)` (сеть) → `enrichTweet`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/tweet-card.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/tweet-card.mdx` — документация

## Зависимости

`react-tweet` (`enrichTweet`, `getTweet` из `react-tweet/api`), `cn`.

## Совместимость и адаптация

`adaptable` при условии статичных данных: `TweetCard` (async server
component с сетевым запросом) в Remotion не использовать; заранее
сохранить JSON твита и рендерить `MagicTweet tweet={json}`. Аватар и
фото — скачать в `public/` и подменить URL на `staticFile` (или
`<Img>` + `delayRender`), видео — `OffthreadVideo`. Появление —
обёртка с анимацией по кадру.

## Паттерны

`key-point-emphasis`, `relationships`
