# WeeklyProgress — `animata/weekly-progress`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `svg`, `engine:other` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Виджет 208×208 прогресса чтения: автор и название книги, бейдж с иконкой книги «30%»,
семь маленьких колец по дням недели (M…SU), которые при появлении
заполняются янтарным.

## Когда использовать

Привычки, «читаю каждый день», недельная регулярность, streak.

## Фразы из озвучки

- «семь дней подряд без пропусков»
- «прочитано тридцать процентов книги»
- «маленькие шаги каждый день»

## Визуальный стиль

amber-50 фон, кольца stroke amber-500 по `stroke-border`, подписи дней
внутри; тёплый, «книжный».

## Входные данные

`className?`, `author = "Chris Dixon"`, `title = "Read Write Own"`,
`percent = 30`. Заполнение колец по коду фиксировано (offset 565.48 →
118.692, ≈79%), от `percent` не зависит.

## Анимации

SVG SMIL `<animate attributeName="stroke-dashoffset">` и `opacity` у
подписи, `dur = 0.5 + index*0.1 s`, `fill="freeze"` — проигрывается
браузером по времени после монтирования.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/weekly-progress.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/weekly-progress.mdx` — документация
- `templates/react-libriry/animata/animata/widget/weekly-progress.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: SMIL в Remotion не синхронизирован с кадром (флаг
`engine:other` = SMIL). Удалить `<animate>` и задавать
`strokeDashoffset = 565.48 - (565.48-118.692) * p_i`, `p_i =
interpolate(frame, [0, (0.5+0.1*i)*fps], [0, 1], clamp)`; привязать
заполнение к реальным данным по дням.

## Паттерны

`timeline`, `sequence-steps`, `quantities`
