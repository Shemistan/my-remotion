# Cycling — `animata/cycling`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `ui-mockups` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom`, `css-transition`, `user-events`, `svg` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Тёмный фитнес-виджет 208×208 «Cycling 2h 30m»: иконка велосипеда, стопка
цветных полосок-«карточек» и розовая карточка «Goal 15km» с сегментным
прогресс-баром, снизу сердце и «188 BPM / 130 AVG».

## Когда использовать

Спорт/активность, «цель по километрам», пульс. Соседи:
`animata/weekly-progress`, `animata/sleep-tracker`.

## Фразы из озвучки

- «два с половиной часа в седле»
- «пульс — 188 ударов»
- «до цели осталось совсем немного»

## Визуальный стиль

`bg-zinc-900`, жёлтая иконка, розовая pink-500 карточка, пиксельный
прогресс из 2px-столбиков; спортивно.

## Входные данные

`className?`, `title = "Cycling"`. Цель (15) и прогресс (30%) зашиты в
`CardStack`.

## Анимации

`Progress` (graphs): ширина из `offsetWidth` в `useLayoutEffect`,
`setTimeout(250)`, подсветка столбиков с `transitionDelay: i*6ms`;
`SwapText` (text) меняет «15km» → «4.5km» по hover/клику; сердце
`animate-pulse` на hover.

## Исходники и документация

- `templates/react-libriry/animata/animata/widget/cycling.tsx` — виджет
- `templates/react-libriry/animata/animata/graphs/progress.tsx` — прогресс-бар
- `templates/react-libriry/animata/content/docs/widget/cycling.mdx` — документация
- `templates/react-libriry/animata/animata/widget/cycling.stories.tsx` — пример

## Зависимости

`lucide-react`, `animata/graphs/progress`, `animata/text/swap-text`.

## Совместимость и адаптация

`adaptable`: число столбиков задать константой (ширина карточки известна),
подсветку столбика `i` — по `frame > start + i*0.2`; `SwapText` заменить
на смену текста по кадру; пульсацию сердца — `scale` из `sin(frame)`.
Цель/прогресс вынести в props.

## Паттерны

`quantities`, `growth-decline`
