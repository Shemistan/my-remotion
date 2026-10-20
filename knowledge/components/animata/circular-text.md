# CircularText — `animata/circular-text`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `text-animation` |
| Совместимость с Remotion | adaptable |
| Флаги | `engine:motion` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Текст, разложенный по окружности (каждый символ повёрнут на свой угол), и
весь круг бесконечно медленно вращается — «печать», бейдж.

## Когда использовать

Бейджи «New», «Since 2010», «scroll for more», печать качества, логотип-кольцо
вокруг иконки.

## Фразы из озвучки

- «проверено временем»
- «знак качества»
- «круглосуточно»

## Визуальный стиль

Декоративный, «штамп»; круг `h-48 aspect-square`, медленный цикл.

## Входные данные

`text: string`, `spinDuration?: number` (30, секунд на оборот), `radius?:
number` (5, px — сдвиг `translateY(-radius)` для каждого символа),
`className?`.

## Анимации

`motion.div` `animate={{ rotate: 360 }}`, `ease: "linear"`, `repeat:
Infinity`, `duration: spinDuration`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/circular-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/circular-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/circular-text.stories.tsx` — пример

## Зависимости

`motion` (`motion/react`), `@/lib/utils`.

## Совместимость и адаптация

Заменить `motion.div` на `div` с `rotate: (frame/fps/spinDuration)*360 deg`.
Раскладка символов уже статична.

## Паттерны

`abstract-concepts`, `key-point-emphasis`
