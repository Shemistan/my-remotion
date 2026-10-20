# Bento Seven — `animata/bento-seven`

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

Каркас bento из 7 плашек на сетке 4×3: широкая жёлтая + зелёная + красная;
серая + широкая фиолетовая (3 колонки); две серые по половине.

## Когда использовать

Плотная раскладка 7 элементов — «семь функций», карта продукта. Соседи:
`animata/bento-six`, `animata/bento-nine`.

## Фразы из озвучки

- «семь причин выбрать нас»
- «каждый модуль на своём месте»
- «давайте пройдёмся по всем»

## Визуальный стиль

Пастельные yellow/green/red/zinc/purple-300, rounded-2xl, gap-3, p-4.

## Входные данные

Без props.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/seven.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/seven.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/seven.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка; контент свой, вход stagger по кадру.

## Паттерны

`system-structure`, `sequence-steps`
