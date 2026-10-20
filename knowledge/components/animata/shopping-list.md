# ShoppingList — `animata/shopping-list`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Виджет-список 192×256 «Shopping list»: квадратные чекбоксы и пункты
(Milk, Eggs ✓, Ground pepper ✓, Spaghetti, Butter); отмеченные
закрашены, текст зачёркнут.

## Когда использовать

Чек-лист, «что нужно сделать», прогресс по пунктам. Круглые чекбоксы и
счётчик — `animata/reminder-widget`.

## Фразы из озвучки

- «молоко, яйца, спагетти — по списку»
- «отмечаем выполненное»
- «осталось купить ещё три вещи»

## Визуальный стиль

`bg-background`, rounded-3xl, чёрные (foreground) чекбоксы, 15px текст.

## Входные данные

`className?`, `title = "Shopping list"`, `items?: {id, title, checked?}[]`.

## Анимации

Клик переключает `checked`; `transition-colors` на чекбоксе.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/shopping-list.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/shopping-list.mdx` — документация
- `templates/react-libriry/animata/animata/widget/shopping-list.stories.tsx` — пример

## Зависимости

`@/lib/utils`.

## Совместимость и адаптация

`adaptable`: на каждом кадре передавать новый `items` с `checked = frame
> t_i` (компонент пересинхронизирует `rows` при смене ссылки `items`).

## Паттерны

`sequence-steps`
