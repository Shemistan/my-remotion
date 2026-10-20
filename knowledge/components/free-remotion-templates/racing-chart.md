# Racing Bar Chart — `free-remotion-templates/racing-chart`

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

«Гонка» горизонтальных баров: серии с подписями слева и значением внутри
бара; значения плавно переходят между шагами, бары растягиваются
относительно текущего лидера и меняются местами по рангу.

## Когда использовать

Изменение рейтинга во времени: доли рынка по годам, популярность языков,
кто кого обогнал. Ранг меняется **скачком** (позиция = ранг × высота
строки, без интерполяции) — для плавного обгона доработать. Для одного
среза — `bar-chart-anim`.

## Фразы из озвучки

- «за пять лет лидер сменился»
- «новичок обогнал всех конкурентов»
- «посмотрим, как менялись доли рынка»

## Визуальный стиль

Тёмно-синий `#0b1f3a`, бары-пилюли высотой 48 px своих цветов, заголовок
64 px слева. Подписи и значения 16 px — мелко для 1080p. 1920×1080, 210
кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`RacingChartProps`: `data: {label, values: number[], color}[]` (5 серий ×
5 шагов: Aurora, Beacon, Cobalt, Delta, Echo), `frames` (36 — кадров на
переход между шагами), `title` («Market Share Race»), `background?`
(`#0b1f3a`), `titleColor?` (`#ffffff`).

## Анимации

Заголовок opacity 0–12 кадров; с кадра 18 — непрерывный индекс шага
(`interpolate`, linear) по `(steps−1)·frames`, линейная интерполяция
значений между соседними шагами; ширина = значение / текущий максимум;
сортировка → `translateY` по рангу; блок баров fade-in 8 кадров.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/racing-chart/RacingChart.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`. Для плавного обгона интерполировать позицию (например, по
дробному рангу или `spring` от смены ранга); увеличить шрифты; подписи
периода (год) не выводятся — добавить при необходимости.

## Паттерны

`comparison`, `growth-decline`, `timeline`
