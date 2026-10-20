# WaterTracker — `animata/water-tracker`

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

Виджет 208×208 «Water»: «750 ml of 2,000 ml today», синяя кнопка
«+250 ml» и справа вертикальная колба, заполненная голубым градиентом на
долю от цели.

## Когда использовать

Привычки/здоровье, «прогресс к цели» в любых единицах; наполнение до
100% по кадру.

## Фразы из озвучки

- «выпито уже 750 миллилитров»
- «до нормы — ещё пять стаканов»
- «цель на день выполнена»

## Визуальный стиль

`bg-card`, sky-600 кнопка, колба sky-600 → sky-400; чисто и дружелюбно.

## Входные данные

`className?`, `dailyGoal = 2000`, `sipMl = 250`, `defaultIntake = 750`,
`intake?` (контролируемый), `onIntakeChange?`.

## Анимации

Клик добавляет `sipMl`; высота колбы — `transition-[height] duration-300
ease-out`; hover/active scale кнопки.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/water-tracker.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/water-tracker.mdx` — документация
- `templates/react-libriry/animata/animata/widget/water-tracker.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: управлять через `intake={Math.round(interpolate(frame, …))}`
(контролируемый режим уже есть); убрать transition, чтобы высота шла
точно по кадру. При `intake ≥ dailyGoal` кнопка серая.

## Паттерны

`growth-decline`, `quantities`
