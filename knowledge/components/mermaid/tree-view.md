# TreeView (beta) — `mermaid/tree-view`

| Поле | Значение |
|---|---|
| Репозиторий | `mermaid` (`templates/infografika/mermaid`) |
| Вид | diagram-type, beta (`treeView-beta`, v11.14.0+) |
| Категория | `diagrams-flow` |
| Совместимость с Remotion | complex |
| Флаги | `svg`, `dom`, `engine:d3`, `async-data` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE, package.json) |

## Что визуализирует

Дерево каталогов, как в файловом менеджере: узлы с отступами,
линии-коннекторы, папки жирным, по желанию иконки файлов и папок и
аннотации.

## Когда использовать

Структура проекта, репозитория, файлового хранилища, вложенного меню. Для
свободной иерархии идей — `mermaid/mindmap`.

## Фразы из озвучки

- «весь код лежит в папке src»
- «в корне проекта всего два файла конфигурации»
- «посмотрим, как устроен репозиторий»

## Визуальный стиль

«Терминальное» дерево с линиями `├── └──`. Технический, минималистичный.

## Входные данные

Текстовый DSL (`docs/syntax/treeView.md`):

```
treeView-beta
    my-project/
        src/
            index.js
        package.json
```

Структура — отступами или box-drawing символами (`├── └── │`). Папка
отмечается `/` в конце, имена с пробелами — в кавычках, иконка — `icon()`.
В конфиге есть `showIcons` (`TreeViewDiagramConfig`).

## Анимации

Своей анимации нет. По кадру строки появляются сверху вниз, как при
раскрытии папок.

## Исходники и документация

- `templates/infografika/mermaid/packages/mermaid/src/diagrams/treeView/detector.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/treeView/diagram.ts`
- `templates/infografika/mermaid/packages/mermaid/src/diagrams/treeView/renderer.ts` — `getIconSVG`, `registerIconPacks`
- `templates/infografika/mermaid/docs/syntax/treeView.md`, `templates/infografika/mermaid/demos/treeView.html`

## Зависимости

`mermaid` 12.2.0, `d3`, `rendering-util/icons`.

## Совместимость и адаптация

`complex`. Общий рецепт — `compatibility/mermaid.md`. Специфика: внешние
icon packs зарегистрировать до render. Строки идут в порядке DSL, так что
показывать их можно по индексу. Классы сверить по готовому SVG.

## Паттерны

`system-structure`
