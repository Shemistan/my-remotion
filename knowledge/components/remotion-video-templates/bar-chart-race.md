# BarChartRace — `remotion-video-templates/bar-chart-race`

| Поле | Значение |
|---|---|
| Репозиторий | `remotion-video-templates` (`templates/remotion-components/remotion-video-templates`) |
| Вид | template |
| Категория | `charts-data` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE) |

## Что визуализирует

«Гонка» горизонтальных баров: серии меняют значения по шагам времени
(месяцы, кварталы), бары растут и плавно меняются местами по рангу;
справа число, в углу крупно и бледно — текущий шаг.

## Когда использовать

Рейтинг во времени: кто кого обогнал, смена лидера, доли рынка по годам.
Для одной серии во времени — `line-chart-draw`; для статичного сравнения —
обычный бар-чарт.

## Фразы из озвучки

- «к июню новичок обогнал всех конкурентов»
- «посмотрим, как менялся рейтинг год за годом»
- «лидер долго держался, но в итоге уступил»

## Визуальный стиль

Белый фон, Inter, цветные скруглённые бары с цветной тенью, бары до 96 px.
1920×1080, 30 fps; длительность считается от данных.

## Входные данные

`chartSchema` (`sample-data.ts`): `title: string`, `steps: string[]`
(2..24), `series: {label, color: zColor(), values: number[]}[]` (1..6).
Пример по умолчанию — MAU четырёх продуктов за Jan–Jun.
`barChartRaceCalculateMetadata`: 18 (intro) + (steps−1)×45 + 45 кадров.

## Анимации

Дробный индекс шага `t = interpolate(frame, …)`; значение `valueAt(values,
t)`; ранг интерполируется между целыми шагами с `Easing.inOut(ease)`;
рост от нуля на входе — `spring({damping: 200}, 18 кадров)`. Ось максимума
фиксирована (`globalMax`).

## Исходники и документация

- `templates/remotion-components/remotion-video-templates/src/templates/ChartVideo/BarChartRace.tsx`
- `templates/remotion-components/remotion-video-templates/src/templates/ChartVideo/sample-data.ts`
- `templates/remotion-components/remotion-video-templates/README.md`

## Зависимости

`remotion`, `zod`, `@remotion/zod-types`, `lib/colors`, `lib/fonts`.

## Совместимость и адаптация

`native`. Отрисовка — div-ы, не SVG. Подписи значений — `Math.round`
(без единиц/форматирования) — добавить формат при нужде.

## Паттерны

`comparison`, `growth-decline`, `timeline`, `quantities`
