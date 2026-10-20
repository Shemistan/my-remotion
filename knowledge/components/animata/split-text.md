# SplitText — `animata/split-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `css-transition`, `user-events`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Огромное слово, каждая буква которого разрезана по горизонтали; под
курсором половинки буквы расходятся вверх/вниз (20px), у соседей — меньше
(12px и 4px).

## Когда использовать

«Раскол», «разрыв», «разделение», дисплейный бренд-момент. По кадру —
«волна раскола», бегущая по буквам. Hover-анимацию воспроизвести по кадру.

## Фразы из озвучки

- «рынок раскололся надвое»
- «разделим задачу»
- «трещина в системе»

## Визуальный стиль

`font-black uppercase text-yellow-500`, до `lg:text-9xl`, плакатный.

## Входные данные

`text: string` (`"ANIMATA"`), `className?`.

## Анимации

`onMouseEnter` задаёт `activeIndex`; половинки получают `translate-y-±5/3/1`
для |Δ|=0/1/2; `transition-transform duration-300 ease-out`; уход —
`setTimeout`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/split-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/split-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/split-text.stories.tsx` — пример

## Зависимости

`react`, `@/lib/utils`.

## Совместимость и адаптация

Позицию «курсора» `c(frame)` двигать по буквам (`interpolate`), раздвиг
каждой половинки `= max(0, 20 − 8·|i − c|)` px (сглаженно вместо ступенек).
Обработчики и таймер убрать.

## Паттерны

`comparison`, `key-point-emphasis`
