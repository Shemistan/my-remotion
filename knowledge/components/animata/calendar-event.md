# CalendarEvent — `animata/calendar-event`

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

Виджет календаря 208×208: день недели (розовым) и число, до двух событий
цветными плашками с точкой (название + время) и строка «+N more» с
временем следующего.

## Когда использовать

Mockup расписания: «ваш день», «встреча в 10:00», планирование. Для
будильников — `animata/alarm-clock`.

## Фразы из озвучки

- «в десять — дизайн-ревью»
- «день расписан по минутам»
- «и ещё одна встреча после обеда»

## Визуальный стиль

iOS-like: `bg-background`, rounded-3xl, цветные чипы violet/cyan/emerald/
amber/rose (15% фон), 15px полужирный.

## Входные данные

`className?`, `date = new Date()`, `events = DEFAULT_CALENDAR_EVENTS`
(Design critique / Lunch with Alex / Ship review), `maxVisible = 2`.
`CalendarEventItem = {title, time, variant?}`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/calendar-event.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/calendar-event.mdx` — документация
- `templates/react-libriry/animata/animata/widget/calendar-event.stories.tsx` — пример

## Зависимости

`@/lib/utils`; цвета темы.

## Совместимость и адаптация

`adaptable`: статичный mockup. Обязательно передать фиксированный `date`
(дефолт `new Date()` даёт разный результат при рендере в разные дни;
`toLocaleString` зависит от локали). Вход событий — stagger по кадру.

## Паттерны

`timeline`, `sequence-steps`
