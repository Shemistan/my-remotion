# CycleText — `animata/cycle-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion`, `timers` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Строка кода `System.out.println("…")`, в которой слово в кавычках каждые
1.3 с меняется: старое уезжает вверх, новое въезжает снизу.

## Когда использовать

Программистский контекст: «выводим разные значения», перебор вариантов в
коде. Для обычного текста — `animata/text-flip` или пресеты TextAnimator.

## Фразы из озвучки

- «программа выводит …»
- «подставляем разные значения»
- «Hello, World»

## Визуальный стиль

Моноширинный `text-xl`, розовый каркас и синее слово.

## Входные данные

Props нет. Слова зашиты: `["Hello", "World", "Ciaoo", "World"]`; интервал 1300
мс. Для видео вынести слова и интервал в props.

## Анимации

`AnimatePresence mode="wait"` + `motion.h1`: `initial {opacity 0, y 30}` →
`animate {opacity 1, y 0}` → `exit {opacity 0, y −30}`, `duration 0.08`;
`setInterval` переключает индекс.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/cycle-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/cycle-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/cycle-text.stories.tsx` — пример

## Зависимости

`motion` (`AnimatePresence`, `motion`).

## Совместимость и адаптация

`index = floor(frame / (1.3*fps)) % words.length`; переход по локальному
кадру внутри интервала (`interpolate` за ~3 кадра ≈ 0.08 с). Убрать
`setInterval` и AnimatePresence.

## Паттерны

`transformation`, `sequence-steps`
