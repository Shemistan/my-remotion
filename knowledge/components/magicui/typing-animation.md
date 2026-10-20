# TypingAnimation — `magicui/typing-animation`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `css-animation`, `dom`, `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст печатается по символу с мигающим курсором; при списке слов —
печать, пауза, стирание и печать следующего.

## Когда использовать

Промпт, поисковый запрос, команда, «пишем сообщение»; перебор
формулировок. Для терминала с несколькими строками — `terminal`.

## Фразы из озвучки

- «просто напишите, что вам нужно»
- «вводим запрос в поиск»
- «одна команда — и готово»

## Визуальный стиль

Нейтральный (`leading-20 tracking-[-0.02em]`), курсор `|`, `▌` или
`_`; ритм пишущей машинки, 100 мс на символ.

## Входные данные

- `children?: string` или `words?: string[]`
- `duration?` = `100` (мс/символ); `typeSpeed?`, `deleteSpeed?` (= typeSpeed/2)
- `delay?` = `0`; `pauseDelay?` = `1000`; `loop?` = `false`
- `as?` = `"span"`; `startOnView?` = `true`
- `showCursor?` = `true`; `blinkCursor?` = `true`; `cursorStyle?` = `"line"|"block"|"underscore"` (`"line"`)

## Анимации

Машина состояний typing → pause → deleting на цепочке `setTimeout`;
старт по `useInView`; курсор — `animate-blink-cursor` (`@keyframes
blink-cursor`, `1.2s step-end infinite`). Графемы через `Array.from`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/typing-animation.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/registry/registry-ui.ts` — `@keyframes blink-cursor`
- `templates/react-libriry/magicui/apps/www/content/docs/components/typing-animation.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/typing-animation-demo.tsx` — пример

## Зависимости

`motion` (`useInView`, `motion.*` как обёртка), `cn`.

## Совместимость и адаптация

`adaptable`. Число символов `= floor((frame - delay)/framesPerChar)`,
для `words` — расписать фазы по кадрам (печать n·k, пауза, стирание
n·k/2). Курсор: `opacity = (frame % 36) < 18 ? 1 : 0` (1.2 с при 30
fps). Таймеры и `useInView` удалить.

## Паттерны

`sequence-steps`, `key-point-emphasis`
