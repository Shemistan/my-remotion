# NotificationCard — `animata/notification-card`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Белое уведомление (логотип + серый заголовок + жирный текст сообщения)
съезжает сверху, затем из-под него выдвигается вниз зелёная «таблетка»
отправителя с аватаром, именем и должностью.

## Когда использовать

«Пришло сообщение», отзыв клиента, реплика пользователя, push-уведомление.
В доках `published: false`.

## Фразы из озвучки

- «и вот пришло сообщение от клиента»
- «нам написал пользователь»
- «уведомление о новой заявке»

## Визуальный стиль

Светлый UI: `bg-white rounded-lg shadow-lg`, плашка `bg-green-600
rounded-full`, аватар 56px с белой рамкой.

## Входные данные

`NotificationCardProps`: `title: string`, `message: string`, `userInfo:
{name, title, avatar}` (URL картинки), `RosettaLogo: React.FC` (компонент
логотипа).

## Анимации

motion на mount: карточка `y −50 → 0, opacity 0 → 1` (0.5 с, easeOut);
плашка `y 0 → 80, opacity 0 → 1` (delay 0.5, 0.6 с).

## Исходники и документация

- `templates/react-libriry/animata/animata/card/notification-card.tsx` — компонент
- `templates/react-libriry/animata/content/docs/card/notification-card.mdx` — документация (published: false)
- `templates/react-libriry/animata/animata/card/notification-card.stories.tsx` — пример

## Зависимости

`motion`.

## Совместимость и адаптация

Только входная анимация → `interpolate(frame, [0, 15], …)` для карточки и
`[15, 33]` для плашки (30 fps) с `Easing.out`; `avatar` — `staticFile`.

## Паттерны

`cause-effect`, `key-point-emphasis`
