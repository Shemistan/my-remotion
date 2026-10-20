# Chat Conversation (bit) — `remotion-bits/bit-chat-conversation`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Переписка в стиле мессенджера: шесть пузырей сообщений (свои справа, чужие
слева, с аватарами-инициалами) появляются по одному.

## Когда использовать

Диалог клиента и поддержки, отзыв, «как это обсуждали в команде»,
демонстрация чат-бота; вертикальные ролики (1080×1920). Для печати текста
в одном поле — `basic-typewriter`; для терминала — `cli-simulation`.

## Фразы из озвучки

- «клиент написал нам в чат»
- «вот как выглядел этот диалог»
- «бот отвечает за секунды»
- «коллега спросил, что мы поменяли»

## Визуальный стиль

Тёмный фон, пузыри со скруглением `vmin*4` и «хвостиком» (меньший радиус
в нижнем углу), свои — `--color-primary`, чужие — `--color-surface-light`,
тень; sans-serif `vmin*4`. 150 кадров, 1080×1920.

## Входные данные

Массив `messages: {from: "them"|"me", text}[]` внутри `Component`;
модульный `props = {variant: "pop"|"slide"|"rise", showAvatars: true,
stagger: 20}` и `controls` для playground (в компонент не передаются —
читаются из константы). `startDelay = 10`.

## Анимации

Каждое сообщение — свой `StaggeredMotion` с `delay = 10 + index*stagger`:
`pop` — scale 0.4→1 + y + opacity, spring, 22 кадра; `slide` — x со своей
стороны, easeOutCubic, 20; `rise` — y + opacity + blur 8→0, 24.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/staggered-motion/ChatConversation.tsx` — сцена с `metadata`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/chat-conversation.mdx` — страница bit

## Зависимости

`remotion-bits`: `StaggeredMotion`, `useViewportRect`.

## Совместимость и адаптация

`native`. Вынести `messages` и `props` в настоящие props компонента;
определить CSS-переменные `--color-background-dark`, `--color-primary`,
`--color-primary-hover`, `--color-surface-light`. Нет автоскролла — при
длинном диалоге сообщения не помещаются.

## Паттерны

`sequence-steps`, `relationships`, `timeline`
