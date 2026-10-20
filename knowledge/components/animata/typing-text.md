# TypingText — `animata/typing-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Печатная машинка: текст набирается по символу (или проявляется по словам в
`smooth`), мигает курсор `|`; при `repeat` стирается и набирается снова.

## Когда использовать

Терминал, команды CLI, промпт для ИИ, «генерация…», поисковый запрос.
Хорошо в тёмной плашке (как в примере доков: `bg-gray-800 text-yellow-400`).

## Фразы из озвучки

- «вводим команду»
- «спросим у нейросети»
- «пишем запрос»

## Визуальный стиль

`font-mono`, без фона; невидимая копия текста резервирует место (если
`grow=false`).

## Входные данные

`TypingTextProps`: `text: string`, `delay?` (32 мс на символ/слово),
`repeat?` (true), `cursor?: ReactNode` (`<Blinker/>`, мигание 500 мс),
`grow?` (false), `alwaysVisibleCount?` (1), `smooth?` (false, по словам с
`transition-opacity 300`), `waitTime?` (1000 мс), `onComplete?`,
`hideCursorOnComplete?` (false), `className?`.

## Анимации

`setInterval(stepMs)` двигает каретку вперёд/назад; `setTimeout(waitTime)`
на разворот; `CursorWrapper` мигает каждые 100 мс вне паузы.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/typing-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/typing-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/typing-text.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Таймеры заменить на `index = min(total, floor(frameMs / delay))` (с фазой
стирания при `repeat`); курсор — `floor(frameMs/500) % 2`. В `smooth`
opacity слова — `interpolate` за 300 мс.

## Паттерны

`sequence-steps`, `key-point-emphasis`
