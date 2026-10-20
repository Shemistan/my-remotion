# AlarmClock — `animata/alarm-clock`

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

Квадратный виджет 208×208 «Alarms» в стиле iOS: до двух будильников
(время крупно, расписание мелко) с тумблерами; выключенные — бледнее.

## Когда использовать

Mockup «утренняя рутина», «напоминания», привычки; сцена «будильник
включился». Соседи: `animata/reminder`, `animata/calendar-event`.

## Фразы из озвучки

- «будильник на 7:30 по будням»
- «начните утро правильно»
- «выходные — можно поспать до девяти»

## Визуальный стиль

`bg-background`, рамка, rounded-3xl, shadow-md; типографика 22px
tabular-nums; нейтрально-системный.

## Входные данные

`className?`, `alarms?: {id, time, schedule}[]` (по умолчанию 7:30 AM
Weekdays, 9:00 AM Sat & Sun; показываются первые 2),
`defaultEnabledIds = ["weekday"]`.

## Анимации

Только переключение `ToggleSwitch` (CSS `transition-all` translate кружка)
по клику.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/alarm-clock.tsx` — виджет
- `templates/react-libriry/animata/animata/button/toggle-switch.tsx` — тумблер
- `templates/react-libriry/animata/content/docs/widget/alarm-clock.mdx` — документация
- `templates/react-libriry/animata/animata/widget/alarm-clock.stories.tsx` — пример

## Зависимости

`lucide-react`, `animata/button/toggle-switch`, `@/lib/utils`; цвета темы
(`--background`, `--muted`, `--foreground`).

## Совместимость и адаптация

`adaptable`: статичный mockup. «Включение» будильника по кадру —
заменить `ToggleSwitch` на контролируемый вариант с
`translateX(interpolate(frame, …))`. Задать CSS-переменные темы.

## Паттерны

`timeline`, `sequence-steps`
