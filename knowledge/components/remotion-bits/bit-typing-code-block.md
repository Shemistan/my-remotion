# Typing Code Block (bit) — `remotion-bits/bit-typing-code-block`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | example |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

React-компонент (`useState`, `useEffect`, `button`) «набирается» на тёмном
фоне редактора: подсвеченный код растёт по символам, на конце мигает
курсор `|`, номера строк стоят слева.

## Когда использовать

Имитация живого кодинга: «пишем компонент с нуля», лайвкодинг в туториале.
Если код должен появиться разом, бери `bit-basic-code-block`, для команд
терминала — `cli-simulation`.

## Фразы из озвучки

- «давайте напишем это вместе»
- «добавляем состояние и эффект»
- «пара минут — и компонент готов»

## Визуальный стиль

Фон `#1e1e1e` в духе VS Code, тема prism `dark`, шрифт 2 % ширины кадра,
блок шириной 80 %. 180 кадров; размер в metadata не указан.

## Входные данные

Props нет. Внутри: `fullCode` (≈13 строк TSX), `typingSpeed = 0.3` (кадров
на символ, то есть ≈3 символа за кадр), курсор мигает каждые 15 кадров;
`language "typescript"`, `showLineNumbers`, `theme "dark"`.

## Анимации

- Показ кода считается так: `fullCode.slice(0, floor(frame/0.3))`.
- Курсор: `floor(frame/15) % 2`.
- Подсветка prism пересчитывается каждый кадр.
- Построчного reveal нет: `transition` не передан.

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/code-block/TypingCodeBlock.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/typing-code-block.mdx` — документация
- карточка компонента: `components/remotion-bits/code-block.md`

## Зависимости

`remotion` (`AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`);
`remotion-bits` (`CodeBlock`, `useViewportRect`), `prism-react-renderer`.

## Совместимость и адаптация

`native`, всё детерминировано по кадру. Печать очень быстрая: весь код
набирается примерно за 100 кадров. Для реалистичного темпа поднять
`typingSpeed` до 1–2. Курсор вставляется прямо в код, поэтому prism
подсвечивает его как токен.

## Паттерны

`sequence-steps`, `transformation`
