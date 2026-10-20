# Terminal / TypingAnimation / AnimatedSpan — `magicui/terminal`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `engine:motion`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Окно терминала с «светофором»: команда печатается посимвольно, затем
строки вывода (✔ шаги, сообщения) появляются одна за другой,
каждая после окончания предыдущей.

## Когда использовать

Установка пакета, CLI-сценарий, деплой, «одна команда — и готово»,
лог работы агента. Для одной строки ввода — `typing-animation`.

## Фразы из озвучки

- «запускаем одну команду в терминале»
- «проверки пройдены, проект готов»
- «установка занимает пару секунд»

## Визуальный стиль

`max-w-lg`, `rounded-xl border`, `bg-background`, точки red/yellow/
green 8 px; моноширинный `pre/code text-sm`; печать 60 мс/символ,
строки fade+slide 0.3 с.

## Входные данные

- `Terminal`: `children`, `className?`, `sequence?` = `true`, `startOnView?` = `true`
- `TypingAnimation` (внутренний, не путать с `magicui/typing-animation`):
  `children: string`, `duration?` = `60` (мс/символ), `delay?` = `0`,
  `as?` = `"span"`, `startOnView?` = `true`, `className?`
- `AnimatedSpan`: `children`, `delay?` = `0` (мс), `startOnView?` = `false`, `className?`

## Анимации

В режиме `sequence` контекст хранит `activeIndex`; ребёнок стартует,
когда индекс дошёл до него, и по завершении (`onAnimationComplete` /
конец `setInterval`) вызывает `completeItem`. `AnimatedSpan` —
`motion.div` `opacity 0, y -5 → 1, 0` за 0.3 с; печать — `setInterval`.
Старт контейнера — `useInView`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/terminal.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/terminal.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/terminal-demo.tsx` — пример (`shadcn init`)

## Зависимости

`motion` (`motion.*`, `useInView`), `cn`.

## Совместимость и адаптация

`adaptable`. Цепочку событий заменить расписанием: заранее посчитать
кадр старта каждой строки (`start_{i+1} = start_i + len_i·60мс` для
печати или `+0.3 с` для span), затем для строки `i` — число символов
`floor((frame - start_i)/framesPerChar)` или `interpolate` opacity/y.
Удобно через `<Series>`/`<Sequence>`. Таймеры, `useInView`,
`onAnimationComplete` убрать.

## Паттерны

`sequence-steps`, `timeline`, `cause-effect`
