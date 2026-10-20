# Reminder — `animata/reminder`

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

Виджет 208×208 «Today»: две цветные плашки-корзины с крупным числом задач
(Work 2, Home 3) и строка «→ Meeting in 30 min».

## Когда использовать

«План на день», баланс работы и дома, следующее дело. Подробный список —
`animata/reminder-widget`.

## Фразы из озвучки

- «на сегодня две рабочие задачи и три домашние»
- «через полчаса — встреча»
- «день под контролем»

## Визуальный стиль

`bg-background`, violet-200 и emerald-200 плашки, числа text-2xl
tabular-nums.

## Входные данные

`className?`, `title = "Today"`, `buckets?: {label, count, className?}[]`
(показываются первые 2), `nextLabel = "Meeting in 30 min"`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/reminder.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/reminder.mdx` — документация
- `templates/react-libriry/animata/animata/widget/reminder.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статика; числа можно докручивать счётчиком по кадру, плашки —
scale-in.

## Паттерны

`comparison`, `quantities`
