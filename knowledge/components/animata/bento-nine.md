# Bento Nine — `animata/bento-nine`

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

Каркас bento из 9 плашек на сетке 4×3: широкие фиолетовая и жёлтая
(2 колонки), высокая розовая (2 строки), остальные одиночные
amber/lime/zinc/green/red.

## Когда использовать

Мозаика из множества мелких фактов/фич, «экосистема функций». Соседи:
`animata/bento-ten`, `animata/bento-eleven`.

## Фразы из озвучки

- «девять инструментов в одной подписке»
- «каждый найдёт своё»
- «вот вся экосистема»

## Визуальный стиль

Пёстрые пастельные 300-е цвета, rounded-2xl, gap-3, p-4.

## Входные данные

Без props.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/nine.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/nine.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/nine.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка; свой контент и stagger/«волна» от центра по
кадру.

## Паттерны

`system-structure`, `relationships`
