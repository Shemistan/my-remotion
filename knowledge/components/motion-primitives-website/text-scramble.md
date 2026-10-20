# TextScramble — `motion-primitives-website/text-scramble`

| Поле | Значение |
|---|---|
| Репозиторий | `motion-primitives-website` (`templates/react-libriry/motion-primitives-website`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom`, `user-events` |
| Проверка | static-review |
| Лицензия | MIT (package.json; файла LICENSE в репозитории нет) |

## Что визуализирует

«Расшифровка» в моноширинном шрифте: случайные символы (латиница, цифры,
`!@#$%&*`) слева направо превращаются в целевой текст.

## Когда использовать

Киберпанк, хакерская тема, ИИ «декодирует» данные, раскрытие пароля.
Почти идентичен `motion-primitives/text-scramble`, но с триггерами
mount/hover/inView и расширенным набором символов.

## Фразы из озвучки

- «декодируем сообщение»
- «доступ получен»
- «система раскрывает скрытый смысл»

## Визуальный стиль

`inline-block font-mono`; символы `CHARS` с пунктуацией — «грязнее»,
чем у оригинальной библиотеки.

## Входные данные

`TextScrambleProps`: `text: string`; `trigger?: 'mount'|'hover'|'inView'`
(`'mount'`); `duration?` (1500, мс); `charset?`; `speed?` (50, мс между
обновлениями); `onComplete?`; `as?` (`'span'`); `className?`.

## Анимации

`setInterval(speed)`, прогресс `Date.now() - start` / `duration`;
`resolveCount = floor(progress*len)`, остальные — `Math.random` из
`charset`; inView — `IntersectionObserver` (threshold 0.5), hover —
`onMouseEnter`.

## Исходники и документация

- `templates/react-libriry/motion-primitives-website/src/components/text/premium-text.tsx` — компонент (+ `SpringText`, `VariableFontText`)

## Зависимости

`react`, `@/lib/utils` (framer-motion импортируется файлом, компонентом не
используется).

## Совместимость и адаптация

`adaptable`: `progress = clamp((frame - start)/(duration/1000*fps), 0, 1)`,
`step = floor((frame - start)/(speed/1000*fps))`; нерешённые позиции —
`charset[floor(random(\`ts-${i}-${step}\`)*charset.length)]` из remotion
вместо `Math.random`; `Date.now`, `setInterval`, `IntersectionObserver`,
hover удалить.

## Паттерны

`transformation`, `abstract-concepts`, `key-point-emphasis`
