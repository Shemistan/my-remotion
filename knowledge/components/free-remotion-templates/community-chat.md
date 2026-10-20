# Chat Conversation — `free-remotion-templates/community-chat`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Окно командного мессенджера (иконки воркспейсов, список каналов, лента
сообщений, поле ввода). Сообщения с аватаром, автором, временем и реакциями
по очереди всплывают снизу; всё окно слегка наклонено в 3D и медленно
поворачивается по Y.

## Когда использовать

Показать обсуждение в команде, реакцию сообщества, анонс в канале,
«пользователи пишут нам». Не подходит для переписки 1-на-1 в стиле
мессенджера с пузырями (тут лента в стиле Slack/Discord).

## Фразы из озвучки

- «в канале сразу посыпались реакции»
- «команда обсуждает релиз прямо в чате»
- «вот что пишут участники сообщества»

## Визуальный стиль

Тёмная нейтральная палитра, бирюзовый акцент `#2f9e8f`, системный
sans-serif (`-apple-system, "Segoe UI", Roboto`). В Root: 1080×1920, 270
кадров, 30 fps. Размеры элементов в фиксированных px (рейл 76, сайдбар 240).

## Входные данные

`CommunityChatProps`: `workspaceName: string` («Nimbus»), `channelName:
string` («announcements»), `messages: CommunityChatMessage[]` — `{authorName,
avatarLabel, avatarColor?, time, text, reactions?: {emoji, count}[]}`
(по умолчанию 4 сообщения). Палитра `C` зашита в файле, не props.

## Анимации

Сообщение i стартует на кадре `i * floor(fps*0.8)` (24 кадра):
`spring` (damping 18, stiffness 110) → opacity и translateY 10→0.
Окно: `rotateX(6deg)` + `rotateY` 8°→−8° линейно через `interpolate` на всю
длительность, `perspective: 1500`, обёртка `Sequence`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/community-chat/CommunityChat.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`: всё из `useCurrentFrame`/`spring`/`interpolate`. Эмодзи в
реакциях рисуются системным шрифтом рендер-машины — результат зависит от ОС.
Длинная лента не скроллится (overflow hidden) — лишние сообщения обрежутся.

## Паттерны

`sequence-steps`, `relationships`, `key-point-emphasis`
