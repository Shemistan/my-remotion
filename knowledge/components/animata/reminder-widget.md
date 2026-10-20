# ReminderWidget — `animata/reminder-widget`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Высокий виджет 208×320 «Packing» в стиле iOS Reminders: колокольчик,
счётчик оставшихся пунктов и список с круглыми чекбоксами; отмеченные
становятся синими, текст зачёркивается.

## Когда использовать

Чек-лист сборов/подготовки, «всё готово к запуску», пункты
вычёркиваются по очереди. Квадратная альтернатива — `animata/shopping-list`.

## Фразы из озвучки

- «паспорт, ключи, телефон — всё на месте»
- «пункт за пунктом готовимся к поездке»
- «осталось ещё три дела»

## Визуальный стиль

`bg-card`, rounded-3xl, sky-500 акцент, разделители `border-border`.

## Входные данные

`className?`, `title = "Packing"`, `items?: {id, label, done?}[]`
(8 документов/вещей по умолчанию).

## Анимации

Клик переключает `done`; цвет кружка — `transition-colors`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/reminder-widget.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/reminder-widget.mdx` — документация
- `templates/react-libriry/animata/animata/widget/reminder-widget.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: передавать `items` с `done = frame > t_i` (новый массив на
кадр — компонент синхронизирует `rows` по ссылке `items`); галочку и
зачёркивание можно смягчить opacity по кадру. Список с `overflow-y-auto`
не прокрутится сам — следить за высотой.

## Паттерны

`sequence-steps`
