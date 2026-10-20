# JitterText — `animata/jitter-text`

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

Строка мелко дрожит: смещения x/y на 1–1.5px и поворот ±1.5° по
ключевым кадрам, цикл туда-обратно с паузой 0.5 с.

## Когда использовать

Нервозность, холод, страх, «трясёт», срочность, вибрация уведомления.

## Фразы из озвучки

- «рынок лихорадит»
- «нервы на пределе»
- «срочно!»

## Визуальный стиль

Мультяшно-нервный, мелкая амплитуда; вся строка одним `inline-block`.

## Входные данные

`text: string`, `duration?: number` (0.6, секунд), `className?`.

## Анимации

`motion.span` `animate`: `y [1.5,1,−1,1.5,−1.5,1,−0.5,0]`, `x
[0,−1,1.5,−1.5,1,−1,0.5,0]`, `rotate [0.5,−1.5,1,−1.5,1,−1,1,0]`; `repeat:
Infinity`, `repeatType: "reverse"`, `repeatDelay: 0.5`, `easeInOut`.

## Исходники и документация

- `templates/react-libriry/animata/animata/text/jitter-text.tsx` — компонент
- `templates/react-libriry/animata/content/docs/text/jitter-text.mdx` — документация
- `templates/react-libriry/animata/animata/text/jitter-text.stories.tsx` — пример

## Зависимости

`motion`, `@/lib/utils`.

## Совместимость и адаптация

Период = `duration + 0.5` с; внутри — `interpolate(t, равномерные точки,
массив значений)` для x/y/rotate, чётные циклы проигрывать в обратную
сторону. Убрать `motion.span`.

## Паттерны

`key-point-emphasis`, `abstract-concepts`
