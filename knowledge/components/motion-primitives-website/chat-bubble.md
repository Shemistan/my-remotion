# ChatBubble — `motion-primitives-website/chat-bubble`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Пузырь сообщения чата: пользователь — фиолетовый справа, ассистент —
серый слева, системное — по центру курсивом; аватар и время. Пузырь
«выпрыгивает» пружиной со своей стороны.

## Когда использовать

Диалог с ИИ, переписка, отзыв клиента в виде сообщения, «вопрос —
ответ». Вместе с `chat-container` и `typing-indicator`.

## Фразы из озвучки

- «пользователь спрашивает…»
- «и ассистент отвечает»
- «вот реальный отзыв клиента»

## Визуальный стиль

`user`: `bg-violet-600 text-white rounded-2xl rounded-br-md`;
`assistant`: `bg-zinc-800 text-zinc-100 rounded-bl-md`; `system`:
`bg-zinc-900/50 text-zinc-400 text-sm italic`; `max-w-[85%]`, аватар
32 px, время 10 px.

## Входные данные

`ChatBubbleProps`: `children`; `variant?: 'user'|'assistant'|'system'`
(`'assistant'`); `avatar?: ReactNode`; `timestamp?: string`; `delay?`
(0, с); `animate?` (true); `className?`.

## Анимации

`hidden {opacity 0, scale 0.8, x ±20, y 10}` → `visible` spring
`stiffness 300, damping 24`, `delay`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/chat/animated-chat.tsx` — компонент

## Зависимости

`framer-motion`, `tailwindcss`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `animate={false}` даёт статичный `div` — анимацию входа
посчитать в обёртке: `p = spring({frame: frame - start, fps, config: {stiffness: 300, damping: 24}})`,
`opacity p`, `scale(0.8 + 0.2p)`, `translate(${(isUser ? 20 : -20)*(1-p)}px, ${10*(1-p)}px)`.

## Паттерны

`sequence-steps`, `relationships`, `comparison`
