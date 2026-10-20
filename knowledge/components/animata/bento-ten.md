# Bento Ten — `animata/bento-ten`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | example |
| Категория | `lists-grids-stagger` |
| Совместимость с Remotion | adaptable |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Каркас bento из 10 плашек на сетке 4×3: большая фиолетовая 2×2 в центре
слева, высокая лаймовая (2 строки), широкие жёлтая и серая, остальные
одиночные amber/violet/green/gray/lime.

## Когда использовать

Раскладка «одна крупная главная + много мелких». Соседи:
`animata/bento-nine`, `animata/bento-eleven`.

## Фразы из озвучки

- «в центре — главное, вокруг — детали»
- «десять функций, которые экономят время»
- «всё связано с ядром системы»

## Визуальный стиль

Пастельные 300-е цвета, rounded-2xl, gap-3, p-4.

## Входные данные

Без props.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/ten.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/ten.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/ten.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка; главная ячейка появляется первой
(scale-in), остальные — stagger по кадру.

## Паттерны

`system-structure`, `key-point-emphasis`
