# Bento Three — `animata/bento-three`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Финансовая bento-панель 2×2: слева на две строки — виджет недельных трат
(`ExpenseTracker`, столбики по дням), справа — «Total income $7,000»
зелёным и «Top categories» (Food $2,000, Transport $1,000).

## Когда использовать

Сцена «личные финансы / дашборд расходов», доходы vs траты. Для
одиночного графика трат — `animata/expense-tracker`.

## Фразы из озвучки

- «за неделю вы потратили…»
- «доход — семь тысяч, а траты распределились так»
- «больше всего уходит на еду»

## Визуальный стиль

Светлые карточки `bg-background` с рамкой, скругление 3xl, крупные
цифры font-black (зелёный доход, красные траты).

## Входные данные

Без props. Данные: `spendingTrackerProps` из `widget/expense-tracker`,
суммы в разметке.

## Анимации

Собственных нет; у `ExpenseTracker` — hover-затемнение столбиков.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/three.tsx` — композиция
- `templates/react-libriry/animata/animata/widget/expense-tracker.tsx` — вложенный виджет
- `templates/react-libriry/animata/content/docs/bento-grid/three.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/three.stories.tsx` — пример

## Зависимости

`lucide-react`, `animata/widget/expense-tracker`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: статичная композиция. Анимировать вход карточек stagger-ом и
рост столбиков (`height` × progress из кадра). Метка месяца в
`ExpenseTracker` берётся из `new Date()` — зафиксировать для
детерминизма.

## Паттерны

`quantities`, `comparison`
