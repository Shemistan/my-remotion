# StudyTimer — `animata/study-timer`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-animation` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмный виджет 208×208 учебных сессий: иконка «шапочки» в пульсирующем
кольце, бейдж числа сессий, суммарное время «01:47», легенда «57m · 24m
· 26m» и горизонтальная полоса из цветных сегментов пропорционально
длительности.

## Когда использовать

Фокус/помодоро, «сколько времени ушло на задачи», распределение времени.

## Фразы из озвучки

- «почти два часа сосредоточенной работы»
- «двадцать одна сессия за неделю»
- «время распределилось так»

## Визуальный стиль

zinc-900, оранжевый/розовый/жёлтый сегменты, amber-400 бейдж, sky-500
кольцо.

## Входные данные

`className?`, `segments?: {value: number (минуты), color: string}[]` (57/
24/26 по умолчанию), `sessionCount = 21`. Время = сумма минут (`HH:MM`).

## Анимации

`before:animate-pulse` кольца вокруг иконки (Tailwind pulse).

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/study-timer.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/study-timer.mdx` — документация
- `templates/react-libriry/animata/animata/widget/study-timer.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable`: пульс → opacity из `sin(frame)`; сегменты «растут» слева
направо (ширина × прогресс по кадру), время докручивается счётчиком.

## Паттерны

`quantities`, `comparison`, `timeline`
