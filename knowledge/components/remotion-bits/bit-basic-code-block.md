# Basic Code Block (bit) — `remotion-bits/bit-basic-code-block`

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

Четыре строки TypeScript (функция `hello`) с подсветкой синтаксиса и
номерами строк. Строки проявляются сверху вниз и поднимаются на 10 px.

## Когда использовать

Короткий фрагмент кода в туториале или демо API: «вот и весь код».
Подсветку и фокус на строке добавляют через props `highlight`/`focus`
компонента (см. `code-block`). Если код должен печататься, бери
`bit-typing-code-block`.

## Фразы из озвучки

- «всего четыре строки кода»
- «объявляем функцию и возвращаем результат»
- «посмотрим на пример»

## Визуальный стиль

Тема prism `vsDark`, моноширинный шрифт 2,5 % ширины кадра, прозрачный
фон. 120 кадров; размер в metadata не указан.

## Входные данные

Props нет. Внутри: `code` (строка из 4 строк), `language "typescript"`,
`showLineNumbers`, `transition {duration 30, lineStagger 5, opacity [0,1],
y [10,0]}`, `fontSize = rect.width·0.025`. `AbsoluteFill` импортирован, но
не используется.

## Анимации

Построчный вход: каждая строка идёт 30 кадров, следующая стартует через
5 кадров (forward).

## Исходники и документация

- `templates/remotion-components/remotion-bits/docs/src/bits/examples/code-block/BasicCodeBlock.tsx` — сцена
- `templates/remotion-components/remotion-bits/docs/src/content/docs/bits/code-block.mdx` — документация (показывает этот bit)
- карточка компонента: `components/remotion-bits/code-block.md`

## Зависимости

`remotion-bits` (`CodeBlock`, `useViewportRect`), `prism-react-renderer`.

## Совместимость и адаптация

`native`. Фон (например `#1e1e1e`) и центрирование добавить самому; код и
язык вынести в props.

## Паттерны

`sequence-steps`, `system-structure`
