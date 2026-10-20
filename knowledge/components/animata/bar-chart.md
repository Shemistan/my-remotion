# BarChart — `animata/bar-chart`

| Поле | Значение |
|---|---|
| Репозиторий | `animata` (`templates/react-libriry/animata`) |
| Вид | component |
| Категория | `charts-data` |
| Совместимость с Remotion | adaptable |
| Флаги | `timers`, `dom`, `css-transition` |
| Проверка | static-review |
| Лицензия | MIT (LICENSE.md) |

## Что визуализирует

Компактная вертикальная столбчатая мини-диаграмма (sparkline-бары): ряд
столбцов одинаковой ширины с зазором 2px, высота каждого — процент от
высоты контейнера; при появлении столбцы вырастают от нуля.

## Когда использовать

Виджет-иллюстрация динамики, «активность за период», фон для KPI-карточки.
Нет осей, подписей и значений на экране — для объяснения конкретных цифр
брать `remotion-bits/bit-bar-chart` или дополнять подписями самостоятельно.

## Фразы из озвучки

- «активность росла всю неделю»
- «пики приходятся на конец месяца»
- «посмотрим на динамику продаж»

## Визуальный стиль

Минималистичный; цвет каждого столбца — Tailwind-класс в `items[i].className`
(в примере `rounded-md bg-blue-600/NN`, прозрачность ∝ значению), фон
дорожки — `containerClassName`.

## Входные данные

`BarChartProps`: `items: { progress: number /*0–100, клампится*/; label:
string /*в title*/; className?; containerClassName? }[]`, `height?: number`
(px; без него — измеряется `offsetHeight` через `ResizeObserver`, fallback
12), `className?`. Шкала фиксирована 0–100, `max` нет — нормировать данные
до процентов заранее.

## Анимации

Хак: `setTimeout(250)` переключает высоту 0 → `progress/100·height`;
столбцы с `transition-all duration-200` — все растут одновременно, без
stagger.

## Исходники и документация

- `templates/react-libriry/animata/animata/graphs/bar-chart.tsx` — компонент
- `templates/react-libriry/animata/content/docs/graphs/bar-chart.mdx` — документация
- `templates/react-libriry/animata/animata/graphs/bar-chart.stories.tsx` — примеры `Primary`, `WithFilledBackground`

## Зависимости

`react`, `@/lib/utils` (`cn`), Tailwind.

## Совместимость и адаптация

Передавать `height` явно (без ResizeObserver); `setTimeout` и transition
убрать; высоту столбца i = `progress_i/100 · height · interpolate(frame,
[start + i·stagger, start + i·stagger + 15], [0, 1], {easing, clamp})`.
Добавить подписи/значения при необходимости.

## Паттерны

`growth-decline`, `comparison`, `quantities`
