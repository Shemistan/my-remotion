# AiResponseCard — `motion-primitives-website/ai-response-card`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Карточка ответа ИИ: иконка «выпрыгивает», заголовок печатается, затем
стримится текст ответа; по рамке кружит фиолетовый conic-блик; в конце
появляются кнопки действий.

## Когда использовать

Демо ИИ-продукта: «ассистент подготовил сводку», карточка результата
анализа, генерация отчёта. Готовая композиция из `streaming-text`.

## Фразы из озвучки

- «ассистент подготовил краткую сводку»
- «вот что нашёл анализ»
- «и через секунду готов ответ»

## Визуальный стиль

`rounded-xl bg-zinc-900/80 border-zinc-800 p-5`; блик
`conic-gradient(transparent, rgba(139,92,246,0.4), transparent)` 80×80 px,
оборот 3 с; текст `text-sm text-zinc-300`.

## Входные данные

`AiResponseCardProps`: `content: string`; `title?: string`;
`animation?` (`'fade'`, как у `streaming-text`); `speed?` (25, слов/с);
`showBorder?` (true); `icon?: ReactNode`; `actions?: ReactNode`;
`className?`.

## Анимации

Карточка spring 200/20 (`opacity, y 20, scale 0.95`); иконка spring
400/15 `scale 0 → 1`; заголовок — `StreamingText` typewriter 40 ток/с,
по `onComplete` стартует тело; блик `rotate 360` бесконечно; actions —
`delay = слов/speed + 0.5` с.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/chat/animated-chat.tsx` — компонент

## Зависимости

`framer-motion`, внутренний `StreamingText`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: последовательность через колбэк `onComplete` заменить
расписанием: `tTitle = N/40` с, где `N` — число токенов
`title.split(/(\s+)/).filter(Boolean)` (режим `word`, пробелы — тоже
токены), тело стартует с `tTitle`; оба `StreamingText` — по рецепту `streaming-text`; блик
`rotate(${360*frame/(3*fps)}deg)`; пружины — `spring()` remotion.

## Паттерны

`sequence-steps`, `cause-effect`
