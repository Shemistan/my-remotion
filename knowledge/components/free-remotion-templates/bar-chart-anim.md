# Animated Bar Chart — `free-remotion-templates/bar-chart-anim`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `charts-data` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Вертикальная столбчатая диаграмма: заголовок с подзаголовком, под ними
скруглённые сверху столбцы своих цветов растут от базовой линии по очереди;
под каждым — подпись категории. Числовых значений на столбцах нет.

## Когда использовать

Сравнение 3–7 категорий или периодов (кварталы, регионы), рост по кварталам.
Если важно назвать цифру — добавить значения или взять `kpi-counter`; для
динамики во времени с изменением рангов — `racing-chart`; для тренда —
`line-chart-anim`.

## Фразы из озвучки

- «выручка росла каждый квартал»
- «в четвёртом квартале — почти втрое больше, чем в первом»
- «сравним продажи по регионам»

## Визуальный стиль

Тёмный `#0f172a`, яркие столбцы (`#60a5fa`, `#34d399`, `#fbbf24`, `#f472b6`),
заголовок 60 px weight 900, подписи 14 px. Масштаб от `min(w,h)/1080`.
1920×1080, 150 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`BarChartAnimProps`: `title` («Quarterly Revenue»), `subtitle?` («Year over
year +28%»), `bars: {label, value, color?}[]` (Q1–Q4: 120/180/240/320),
`background` (`#0f172a`), `titleColor` (`#ffffff`), `accentColor`
(`#60a5fa`, цвет по умолчанию для столбцов без `color` и подзаголовка).

## Анимации

Заголовок opacity + y −20→0 за 14 кадров `Easing.out(cubic)`; столбцы
`spring({damping: 16, stiffness: 200})` с задержкой 20 и stagger 8 кадров —
высота и opacity; подписи opacity по тому же spring.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/bar-chart-anim/BarChartAnim.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`spring`, `interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`. Подписи 14 px мелковаты для видео — увеличить; при желании
добавить значения над столбцами (например, `AnimatedCounter`).

## Паттерны

`comparison`, `growth-decline`, `quantities`
