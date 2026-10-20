# FibonacciLines — `animata/fibonacci-lines`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Стопка из 10 горизонтальных линий 1px, расстояние между которыми растёт по
числам Фибоначчи, а прозрачность — от 0.1 до 1: эффект перспективы /
«горизонта».

## Когда использовать

Декоративный разделитель или нижняя/верхняя кромка секции, ощущение
глубины и ускорения. `reverse` — плотнее снизу.

## Фразы из озвучки

- «рост ускоряется с каждым шагом»
- «на горизонте — новые возможности»
- «по нарастающей»

## Визуальный стиль

Линии `bg-foreground/10`, минимализм; ощущение ритма.

## Входные данные

`reverse?: boolean` (flex-col-reverse), `className?`, `children?` (после
линий), прочие `HTMLAttributes<div>`.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/container/fibonacci-lines.tsx` — компонент
- `templates/react-libriry/animata/content/docs/container/fibonacci-lines.mdx` — документация
- `templates/react-libriry/animata/animata/container/fibonacci-lines.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`); цвет из `--foreground` темы.

## Совместимость и адаптация

`adaptable`: статика. Для движения — появление линий по одной
(opacity × прогресс из кадра) или сдвиг marginTop по кадру — «линии
разъезжаются». Задать `--foreground` или явный цвет.

## Паттерны

`growth-decline`, `abstract-concepts`
