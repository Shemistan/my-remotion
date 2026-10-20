# StreamingText — `motion-primitives-website/streaming-text`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

Текст, который «стримится» по словам или символам, как ответ LLM:
новые токены появляются с fade, blur или сдвигом; в конце строки мигает
курсор, пока поток не закончится.

## Когда использовать

Ответ ИИ-ассистента в кадре, генерация текста, «модель пишет код /
резюме / письмо». Внутри `chat-bubble` или `ai-response-card`.

## Фразы из озвучки

- «модель генерирует ответ в реальном времени»
- «смотрите, как ИИ пишет письмо»
- «ответ появляется слово за словом»

## Визуальный стиль

`inline` токены; курсор `w-0.5 h-[1.1em] bg-current`, мигание 0.7 с.

## Входные данные

`StreamingTextProps`: `text: string`; `animation?: 'fade'|'blur'|'slide'|
'typewriter'|'none'` (`'fade'`); `speed?` (30, токенов/с); `mode?:
'word'|'character'` (`'word'`); `autoStart?` (true); `showCursor?` (true);
`onComplete?`; `className?`.

## Анимации

`setInterval(1000/speed)` увеличивает `visibleCount`; анимируется только
последний токен: fade 0.15 с, blur 4px → 0 за 0.2 с, slide y 8 → 0.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/chat/animated-chat.tsx` — компонент

## Зависимости

`framer-motion`, `react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: `visibleCount = min(tokens.length, floor((frame - start)/fps * speed))`;
для токена `i` возраст `a = (frame - start)/fps - i/speed`, прогресс
`p = clamp(a/0.15)` (blur — `/0.2`) → `opacity p`, `blur(4(1-p))`,
`translateY(8(1-p))`; курсор `opacity = floor(frame/(0.7*fps)) % 2 ? 0 : 1`
до окончания. `setInterval`/`useState` удалить.

## Паттерны

`sequence-steps`, `abstract-concepts`
