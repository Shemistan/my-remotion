# CodeBlock — `remotion-bits/code-block`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-bits` (`templates/remotion-components/remotion-bits`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json) |

## Что визуализирует

Блок кода с подсветкой синтаксиса (prism), строки которого появляются по
очереди; можно подсветить фоном диапазоны строк и «приглушить» всё вне
фокуса (opacity + blur). Опционально номера строк.

## Когда использовать

Объяснение API, туториалы, «вот как это выглядит в коде», акцент на
конкретной строке. Для набора кода по символам — `type-writer` или
`bit-typing-code-block`; для окна терминала — `bit-terminal-3d`/`cli-simulation`.

## Фразы из озвучки

- «достаточно трёх строк кода»
- «обратите внимание на эту строку»
- «здесь мы подключаем библиотеку, а здесь — вызываем функцию»

## Визуальный стиль

Моноширинный шрифт, темы prism `vsDark`/`vsLight` или своя; фон прозрачный
(задаётся снаружи). Размер шрифта по умолчанию — 1,5 % ширины кадра.

## Входные данные

`CodeBlockProps`: `code: string`; `language?` ("tsx"); `highlight?:
{lines: number | [from,to], color?, opacity?: AnimatedValue, blur?:
AnimatedValue}[]`; `focus?: {lines, dimOpacity? (0.3), dimBlur? (2)}`;
`transition?` (any: `duration` 30, `delay`, `easing`, `lineStagger`,
`lineStaggerDirection` forward/reverse/center/random, `highlightDelay`,
`highlightDuration` 30, плюс трансформы/opacity/blur строки); `theme?:
"dark" | "light" | "custom"` ("dark"); `customTheme?`; `showLineNumbers?`;
`lineNumberColor?` ("#666"); `fontSize?`, `lineHeight?` (1.5), `padding?`
(= fontSize); `className?`, `style?`. Типы `highlight/focus/transition` в
коде — `any`.

## Анимации

Каждая строка — `useMotionTiming` со stagger по индексу → transform/opacity/
blur; подсветка — отдельный линейный прогресс (`highlightDelay/Duration`);
фокус статичен (без анимации переключения).

## Исходники и документация

- `templates/remotion-components/remotion-bits/src/components/CodeBlock.tsx` — компонент
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/code-block.mdx` — страница bit (BasicCodeBlock)
- `templates/remotion-components/remotion-bits/docs/src/bits/examples/code-block/BasicCodeBlock.tsx` — пример

## Зависимости

`prism-react-renderer` (`Highlight`, `themes`), `remotion` (`random`);
внутренние `utils/motion`, `hooks/useViewportRect`.

## Совместимость и адаптация

`native`: прогресс из кадра, без таймеров. Смена фокуса между диапазонами не
анимируется — для «перевода взгляда» использовать несколько `<Sequence>` или
анимировать `dimOpacity` самому. Хук `useMotionTiming` стоит после раннего
`return` (если `Highlight` не загрузился) — при нормальной установке не мешает.

## Паттерны

`sequence-steps`, `key-point-emphasis`, `system-structure`
