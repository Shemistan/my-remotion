# ChatContainer — `motion-primitives-website/chat-container`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `dom` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Тёмное окно чата со скруглением, внутри — колонка сообщений с
отступами; при добавлении сообщений окно само прокручивается вниз.

## Когда использовать

Рамка для сцены «диалог с ИИ-ассистентом», переписка поддержки,
мессенджер-демо. Внутрь кладутся `chat-bubble`, `typing-indicator`,
`streaming-text`.

## Фразы из озвучки

- «давайте спросим ассистента»
- «вот как выглядит диалог с ботом»
- «клиент пишет в поддержку»

## Визуальный стиль

`rounded-2xl`, варианты: `default` (`bg-zinc-950 border-zinc-800`),
`glass` (`bg-zinc-950/60 backdrop-blur-xl border-white/10`), `dark`
(`bg-black`); внутри `p-4 space-y-3`, `overflow-y-auto`.

## Входные данные

`ChatContainerProps`: `children`; `autoScroll?` (true); `maxHeight?`
(`'600px'`); `variant?: 'default'|'glass'|'dark'` (`'default'`);
`className?`.

## Анимации

Собственной нет; `MutationObserver` на добавление детей →
`scrollIntoView({behavior: 'smooth'})`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/chat/animated-chat.tsx` — компонент (все chat-компоненты в одном файле)

## Зависимости

`react`, `tailwindcss` (классы `scrollbar-thin` требуют плагина, в
`tailwind.config.ts` его нет — без эффекта), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `autoScroll={false}` (smooth-scroll недетерминирован);
прокрутку сделать вручную — внутренний блок `transform: translateY(-offset)`,
где `offset` по кадру растёт на высоту каждого нового сообщения
(высоты задать константами или измерить один раз под `delayRender`).
Появление сообщений — по `<Sequence from>` или по кадру.

## Паттерны

`sequence-steps`, `relationships`
