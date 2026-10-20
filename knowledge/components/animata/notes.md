# Notes — `animata/notes`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Жёлтая заметка-стикер 192×256 (как Apple Notes widget): заголовок «About
John» и строки текста.

## Когда использовать

Цитата/факты о человеке, «запишем главное», конспект из 3–5 пунктов. Для
чек-листа — `animata/shopping-list`.

## Фразы из озвучки

- «запишем главное»
- «несколько фактов о нашем герое»
- «короткая заметка на память»

## Визуальный стиль

`#fced99`, рамка amber-200, rounded-3xl, 13–15px текст; тёплый и
дружелюбный.

## Входные данные

`Notes`: `className?`, `title = "About John"`, `lines?: string[]` (4
строки по умолчанию). Экспортируется и `NotesCard({className, title,
children})` для произвольного содержимого.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/notes.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/notes.mdx` — документация
- `templates/react-libriry/animata/animata/widget/notes.stories.tsx` — пример

## Зависимости

`@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статика. Строки появляются по одной (stagger по кадру) или
«печатаются» срезом строки по кадру.

## Паттерны

`key-point-emphasis`, `sequence-steps`
