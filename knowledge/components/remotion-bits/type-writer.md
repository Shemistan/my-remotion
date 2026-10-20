# TypeWriter — `remotion-bits/type-writer`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Текст, печатающийся посимвольно с мигающим курсором; может стирать и
печатать следующую строку из списка, делать опечатки и исправлять их,
менять скорость печати по ходу строки.

## Когда использовать

Ввод в поисковую строку, промпт к ИИ, команда в терминале, «живая» запись
мысли, перебор вариантов («для дизайнеров… для разработчиков…»). Для
плавного появления без курсора — `animated-text`; для подсвеченного кода —
`code-block`.

## Фразы из озвучки

- «просто напишите запрос»
- «вы вводите команду — и всё работает»
- «для стартапов, для агентств, для корпораций»
- «даже если ошибётесь, система поправит»

## Визуальный стиль

Нейтральный span, курсор `|` или свой ReactNode; переносы `\n` → `<br/>`.
Моноширинный шрифт задаётся снаружи.

## Входные данные

`TypeWriterProps`: `text: string | string[]`; `typeSpeed?: AnimatedValue`
(кадров на символ, 3; массив — переменная скорость по строке);
`deleteSpeed?` (2); `pauseAfterType?` (30); `pauseAfterDelete?` (15);
`errorRate?` (0…1, 0); `errorCorrectDelay?` (5); `seed?` (`"typewriter"`);
`cursor?: boolean | ReactNode` (true); `blinkSpeed?` (30);
`showCursorAfterComplete?` (true); `delay?` (0); `loop?` (false);
`deleteBeforeNext?` (true); `transition?` (Transform+Visual+Timing для
входа контейнера); `style?`, `className?`.

## Анимации

В `useMemo` строится таймлайн событий `{frame, text}` (печать, опечатка,
пауза, стирание); на кадре выбирается последнее событие с `frame ≤
relativeFrame`. Курсор мигает по `relativeFrame % blinkSpeed`. Опечатки —
`random(seed)` и `anyElement` — детерминированы. `loop` — по модулю общей
длительности.

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/TypeWriter.tsx` — компонент
- `templates/remotion-components/remotion-bits/src/utils/random.ts` — `anyElement`
- `templates/remotion-components/remotion-bits/docs/src/content/docs/reference/typewriter.mdx` — справка
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/typewriter/BasicTypewriter.tsx` — пример

## Зависимости

`remotion` (`useCurrentFrame`, `random`); внутренние `utils/motion`,
`utils/random`; транзитивно `three`, `culori`.

## Совместимость и адаптация

`native`: таймеров нет, видимый текст — функция кадра. Длительность сцены
надо подобрать под сумму событий (≈ длина×typeSpeed + паузы).

## Паттерны

`sequence-steps`, `key-point-emphasis`
