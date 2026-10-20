# LiveScore — `animata/live-score`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `user-events`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Спортивное табло 208×208: флаги и коды команд (🇳🇵 NPL vs 🇺🇸 USA),
четыре «перекидных» цифры счёта (тёмные плашки с линией посередине),
нижняя полоса — номер раунда/иннинга, ромб баз, счёт побед.

## Когда использовать

Спорт, соревнование, «счёт сравнялся», противостояние двух сторон.

## Фразы из озвучки

- «счёт три — пять»
- «борьба идёт до последнего раунда»
- «кто победит в этом матче?»

## Визуальный стиль

zinc-800/950, белые цифры text-5xl в рамках, эмодзи-флаги;
табло-ретро.

## Входные данные

Без props. Начальный счёт, победы и раунд — `Math.random`; функция
`getScore` прибавляет случайные очки.

## Анимации

`setTimeout` раз в минуту обновляет счёт (до `lapCount = 5`); hover
сдвигает нижнюю полосу вверх (`transition-transform`), открывая «Some
other information».

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/live-score.tsx` — виджет
- `templates/react-libriry/animata/content/docs/widget/live-score.mdx` — документация
- `templates/react-libriry/animata/animata/widget/live-score.stories.tsx` — пример

## Зависимости

`lucide-react`, `@/lib/utils`.

## Совместимость и адаптация

`adaptable` после выноса данных: `Math.random` даёт разный счёт на каждом
кадре/воркере — заменить на props (команды, счёт, раунд) или `random(seed)`;
смену счёта делать по кадру (`flip`-эффект цифр — rotateX из interpolate).
Эмодзи-флаги зависят от шрифтов системы рендера.

## Паттерны

`comparison`, `quantities`
