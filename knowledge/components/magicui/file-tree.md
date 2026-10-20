# File Tree (Tree / Folder / File) — `magicui/file-tree`

| Поле | Значение |
|---|---|
| Репозиторий | `magicui` (`templates/react-libriry/magicui`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-animation`, `dom` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Дерево файлов проекта, как в IDE: папки с иконками открыта/закрыта,
файлы, вертикальные направляющие вложенности, подсвеченный выбранный
элемент.

## Когда использовать

Структура проекта или репозитория: «вот где лежит конфиг», «добавим
файл в components/ui», обзор архитектуры кода. Интерактивный контрол,
но статичное раскрытое дерево — самостоятельная картинка, поэтому
включён в базу.

## Фразы из озвучки

- «посмотрим на структуру проекта»
- «нужный файл лежит в папке components»
- «всего три директории — и всё на месте»

## Визуальный стиль

`text-sm`, иконки lucide 16 px, отступ вложенности `ml-5`, линия
`bg-muted`, выбранный — `bg-muted rounded-md`; сортировка «папки
первыми, по имени» (`Intl.Collator` numeric).

## Входные данные

- `Tree`: `elements?: TreeViewElement[]` (`{id, name, type?: "file"|"folder", isSelectable?, children?}`),
  `initialSelectedId?`, `initialExpandedItems?: string[]`, `indicator?` = `true`,
  `openIcon?`, `closeIcon?`, `sort?: "default"|"none"|(a,b)=>number` = `"default"`, `dir?`, `className?`
- `Folder`: `value`, `element` (имя), `isSelectable?` = `true`, `isSelect?`
- `File`: `value`, `isSelectable?` = `true`, `isSelect?`, `fileIcon?`, `handleSelect?`
- `CollapseButton`: `elements`, `expandAll?` = `false`

## Анимации

Раскрытие — Radix Accordion `data-[state=open]:animate-accordion-down`
/ `closed:animate-accordion-up` (CSS keyframes из tw-animate-css;
высота из `--radix-accordion-content-height`, измеряется DOM).
Состояние меняется кликами.

## Исходники и документация

- `templates/react-libriry/magicui/apps/www/registry/magicui/file-tree.tsx` — компонент
- `templates/react-libriry/magicui/apps/www/content/docs/components/file-tree.mdx` — документация
- `templates/react-libriry/magicui/apps/www/registry/example/file-tree-demo.tsx` — пример (`initialExpandedItems`)

## Зависимости

`@radix-ui/react-accordion`, `lucide-react`, shadcn `button`, `scroll-area`.

## Совместимость и адаптация

`adaptable`. Статичный кадр: `initialExpandedItems` со всеми нужными
папками + `initialSelectedId` — рендерится сразу. Для анимации
раскрытия/выделения по кадру проще свой рекурсивный список на тех же
данных `TreeViewElement` (строки появляются stagger'ом, подсветка
«бегает» по `selectedId` из кадра), без Radix и `ScrollArea`.

## Паттерны

`system-structure`, `spatial`
