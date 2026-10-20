# Grid — `animata/grid`

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

Статичный фон-клетка (миллиметровка) из линий 1px.

## Когда использовать

«Инженерный» фон под схемы, графики, координаты, чертёж. Соседи:
`animata/dot`, `animata/diagonal-lines`.

## Фразы из озвучки

- «разложим всё по полочкам»
- «посмотрим на это как инженеры»
- «вот координаты нашей задачи»

## Визуальный стиль

Серые линии `#cacaca`, клетка 20px, белый фон; аккуратно, технично.

## Входные данные

`color = "#cacaca"`, `size = 20` (px), `children?` (без них — плашка
20×10 клеток), `className?`, `style = { backgroundColor: "white" }`.

## Анимации

Нет: два `linear-gradient` (горизонталь/вертикаль) + `backgroundSize`.

## Исходники и документация

- `templates/react-libriry/animata/animata/background/grid.tsx` — компонент
- `templates/react-libriry/animata/content/docs/background/grid.mdx` — документация
- `templates/react-libriry/animata/animata/background/grid.stories.tsx` — пример

## Зависимости

Только React.

## Совместимость и адаптация

`adaptable` без доработки. Движение — `backgroundPosition`/`size` из кадра
(наезд камеры, бесконечный скролл сетки).

## Паттерны

`spatial`, `system-structure`
