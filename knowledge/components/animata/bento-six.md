# Bento Six — `animata/bento-six`

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

Каркас bento из 6 плашек на сетке 4×3: верхний ряд — широкая жёлтая +
зелёная + красная, средний — фиолетовая на всю ширину (4 колонки), нижний
— две серые по половине.

## Когда использовать

Раскладка с центральной «баннерной» полосой: верх — три пункта, середина
— главный вывод, низ — два дополнения. Соседи: `animata/bento-seven`.

## Фразы из озвучки

- «три метрики сверху, а посередине — главный вывод»
- «и ещё два бонуса»
- «вся картина целиком»

## Визуальный стиль

Пастельные yellow/green/red/purple/zinc-300, rounded-2xl, gap-3, отступ p-4.

## Входные данные

Без props.

## Анимации

Нет.

## Исходники и документация

- `templates/react-libriry/animata/animata/bento-grid/six.tsx` — раскладка
- `templates/react-libriry/animata/content/docs/bento-grid/six.mdx` — документация
- `templates/react-libriry/animata/animata/bento-grid/six.stories.tsx` — пример

## Зависимости

`@/lib/utils` (`cn`).

## Совместимость и адаптация

`adaptable`: статичная сетка; свой контент и stagger-вход по кадру
(ряд за рядом).

## Паттерны

`system-structure`, `sequence-steps`
