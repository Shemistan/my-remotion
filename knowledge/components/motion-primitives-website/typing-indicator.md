# TypingIndicator — `motion-primitives-website/typing-indicator`

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

Пузырь с тремя подпрыгивающими точками «печатает…», опционально с
подписью (кто печатает).

## Когда использовать

Пауза перед ответом бота, «ИИ думает», ожидание ответа в мессенджере —
между `chat-bubble` пользователя и ответом ассистента.

## Фразы из озвучки

- «ассистент уже печатает ответ»
- «секунду, модель думает»
- «и через мгновение приходит ответ»

## Визуальный стиль

Пузырь `bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3`, точки 8 px
`bg-zinc-400`; подпись `text-xs text-zinc-500`.

## Входные данные

`TypingIndicatorProps`: `visible?` (true); `label?: string`;
`className?`.

## Анимации

Вход/выход spring (300/25) `opacity`, `height 0 → auto`, `y`; точки —
`y [0, -6, 0]`, `opacity [0.4, 1, 0.4]`, 1 с, бесконечно, сдвиг 0.15 с
на точку.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/chat/animated-chat.tsx` — компонент

## Зависимости

`framer-motion` (`AnimatePresence`), `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: для точки `i`
`k = 0.5 - 0.5*cos(2π * ((frame/fps - 0.15*i) mod 1))` → `translateY(${-6*k}px)`,
`opacity 0.4 + 0.6k`; `height: auto`-анимацию заменить на
`opacity`/`scale` по кадру (высоту не анимировать), `visible` — через
`<Sequence>`.

## Паттерны

`sequence-steps`, `abstract-concepts`
