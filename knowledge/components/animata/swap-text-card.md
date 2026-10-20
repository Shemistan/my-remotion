# SwapTextCard — `animata/swap-text-card`

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

Светло-серая карточка `rounded-3xl` с надзаголовком «ANIMATA» и
крупной фразой; по hover фраза уезжает вверх и гаснет, на её место
поднимается поясняющий текст поменьше.

## Когда использовать

Фича-карточка «заголовок → пояснение», «вопрос → ответ», «термин →
определение». Hover воспроизвести по кадру.

## Фразы из озвучки

- «что это значит? — объясняем»
- «коротко — и подробнее»
- «термин и его смысл»

## Визуальный стиль

Минималистичный bento-тайл `min-h-64 md:max-w-[500px] bg-gray-100 p-6`.

## Входные данные

`initialText: string`, `finalText: string`. Надзаголовок «Animata» зашит.
На мобильной ширине (без `md:`) показываются оба текста статично.

## Анимации

Через `animata/swap-text` (`disableClick`): `translateY(−100%)` за 1000 мс
`ease-slow` + opacity начального текста по `group-hover/swap`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/swap-text-card.tsx` — компонент
- `templates/react-libriry/animata/animata/text/swap-text.tsx` — механика
- `templates/react-libriry/animata/content/docs/card/swap-text-card.mdx` — документация
- `templates/react-libriry/animata/animata/card/swap-text-card.stories.tsx` — пример

## Зависимости

`@/animata/text/swap-text`.

## Совместимость и адаптация

Адаптировать `animata/swap-text` (прогресс из кадра) + opacity начального
текста `1 − p`; задать ширину ≥ md, чтобы использовалась анимированная
ветка.

## Паттерны

`transformation`, `comparison`
