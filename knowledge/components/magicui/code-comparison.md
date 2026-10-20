# CodeComparison — `magicui/code-comparison`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `async-data`, `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Две панели кода рядом — «before» и «after» — с подсветкой синтаксиса
Shiki, бейджем «VS» по центру, подсветкой строк, diff-строками (+/−)
и фокусом (остальные строки размыты).

## Когда использовать

Рефакторинг, «было/стало», миграция API, сравнение двух подходов в
коде; объяснение, что именно поменялось. Для одного файла — свой
блок кода.

## Фразы из озвучки

- «было так, а стало вот так»
- «вместо двадцати строк — всего пять»
- «посмотрите, что изменилось в коде»

## Визуальный стиль

`max-w-5xl`, рамка `rounded-md`, шапки с иконкой файла и
`before/after`, моно `text-xs`; diff: зелёный `rgba(16,185,129,.16)` /
красный `rgba(244,63,94,.16)`; highlight `#ff3333`; не-фокусные
строки `opacity 50%` + blur.

## Входные данные

- `beforeCode: string`, `afterCode: string`, `language: string`, `filename: string`
- `lightTheme: string`, `darkTheme: string` (темы Shiki)
- `highlightColor?` = `"#ff3333"`
Нотации в коде (`// [!code highlight]`, `[!code ++]`, `[!code focus]`) —
трансформеры `@shikijs/transformers`.

## Анимации

Нет собственной: при hover на панели снимается blur фокуса
(`transition-all duration-300`). Подсветка асинхронная: `await
import("shiki")` → `codeToHtml` в `useEffect`; до неё — сырой `pre`.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/code-comparison.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/code-comparison.mdx` — документация

## Зависимости

`shiki`, `@shikijs/transformers`, `next-themes`, `lucide-react`, `cn`.

## Совместимость и адаптация

`adaptable`. Подсветку обернуть `delayRender`/`continueRender` (иначе
первые кадры без цвета) или посчитать HTML заранее; `useTheme`
заменить явным выбором темы. Анимация по кадру поверх: появление
панелей, «проявление» строк diff по очереди, перевод фокуса —
управлять классами `.focused`/opacity строк по кадру вместо hover.

## Паттерны

`comparison`, `transformation`
