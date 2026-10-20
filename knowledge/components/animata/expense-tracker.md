# ExpenseTracker — `animata/expense-tracker`

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

Виджет 208×208 «траты за неделю»: месяц и год сверху, 7 вертикальных
капсул-столбиков по дням (синяя заливка = доля дня от суммы недели), итог
«THIS WEEK SPENDING $3,740».

## Когда использовать

Личные финансы, «куда уходят деньги», динамика по дням недели. В связке —
`animata/bento-three`.

## Фразы из озвучки

- «за неделю потрачено почти четыре тысячи»
- «пятница — самый дорогой день»
- «в выходные траты снижаются»

## Визуальный стиль

`bg-background`, серые капсулы 12×80px с синей заливкой blue-500,
font-black итог.

## Входные данные

`spending: {day, amount}[]` (по умолчанию `spendingTrackerProps.spending`:
M 700, T 160, W 500, T 300, F 1280, Sa 200, Su 600). Месяц —
`new Date()`.

## Анимации

Hover: остальные столбики полупрозрачны (`group-hover/expense:opacity-50`).
Заливка — статичная высота с `transition-all`.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/expense-tracker.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/expense-tracker.mdx` — документация
- `templates/react-libriry/animata/animata/widget/expense-tracker.stories.tsx` — пример

## Зависимости

`@/lib/utils`.

## Совместимость и адаптация

`adaptable`: рост столбиков — `height × interpolate(frame - i*4, [0,20],
[0,1])`, итог — счётчиком; подсветку дня делать по кадру. Метку месяца
зафиксировать (сейчас `new Date()` + `toLocaleString`).

## Паттерны

`quantities`, `comparison`, `growth-decline`
