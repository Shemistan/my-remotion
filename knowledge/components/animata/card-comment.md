# CardComment — `animata/card-comment`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation`, `css-transition`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Абстрактная карточка-комментарий: «{commenter} commented» с серыми
пульсирующими полосками-заглушками текста; по hover блок уезжает вверх и
снизу появляется зелёный блок «{replier} replied».

## Когда использовать

Обсуждение, «на вопрос ответили», поддержка, обратная связь. Hover
воспроизвести по кадру.

## Фразы из озвучки

- «клиент оставил комментарий — и сразу получил ответ»
- «команда отвечает за минуты»
- «вопрос — ответ»

## Визуальный стиль

Светлая карточка `h-48 max-w-md`, заглушки `animate-pulse`, ответ
`bg-green-500`.

## Входные данные

Именованный экспорт `CardComment`: `commenter: string`, `replier: string`.

## Анимации

`group-hover/comment:-translate-y-1/3` (`transition-transform`) и
`opacity-0 → 100` (`transition-all`); полоски — Tailwind `animate-pulse`.

## Исходники и документация

- `templates/react-libriry/animata/animata/card/card-comment.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/card-comment.mdx` — документация
- `templates/react-libriry/animata/animata/card/card-comment.stories.tsx` — пример

## Зависимости

Tailwind (`animate-pulse`).

## Совместимость и адаптация

`translateY(−33%·p)` и opacity ответа из кадра; пульс заглушек — opacity
`0.5 + 0.5·sin(…)` от кадра или убрать `animate-pulse`.

## Паттерны

`cause-effect`, `relationships`
