# Animated Line Chart — `free-remotion-templates/line-chart-anim`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `charts-data` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Линейный график: заголовок, 4 горизонтальные линии сетки, ломаная
дорисовывается слева направо, точки «выпрыгивают», когда линия до них
доходит, под ними проявляются подписи оси X. Подписей оси Y и значений нет.

## Когда использовать

Тренд одного показателя во времени: MAU по месяцам, рост выручки, динамика
цены. Шкала Y от 0 до максимума. Для сравнения категорий — `bar-chart-anim`,
для нескольких рядов — не подходит (одна линия).

## Фразы из озвучки

- «аудитория стабильно росла полгода подряд»
- «после небольшого спада в марте — новый рекорд»
- «посмотрим, как менялся показатель по месяцам»

## Визуальный стиль

Тёмный `#0b1220`, бирюзовая линия `#22d3ee` толщиной 6 со скруглением,
полупрозрачная сетка. SVG фиксированного размера 1000×500 px (не
масштабируется под кадр). 1920×1080, 150 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`LineChartAnimProps`: `title` («Monthly Active Users»), `subtitle?` («Last
six months (thousands)»), `points: {label, value}[]` (Jan–Jun: 40, 55, 50,
72, 88, 95), `background` (`#0b1220`), `titleColor` (`#ffffff`), `lineColor`
(`#22d3ee`), `gridColor` (`rgba(255,255,255,0.08)`).

## Анимации

Заголовок opacity 0–14 кадров; линия через `strokeDasharray`/
`strokeDashoffset` = длина·(1−progress), кадры 20–110 `Easing.inOut(cubic)`;
точки r 0→10 с `Easing.out(Easing.back(1.5))` в момент прохода линии;
подписи X — opacity за 8 кадров.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/line-chart-anim/LineChartAnim.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`), `react`.

## Совместимость и адаптация

`native`. Длина пути считается суммой отрезков (точно для ломаной). Для
вертикального формата/4K задать размер SVG от `useVideoConfig`.

## Паттерны

`growth-decline`, `timeline`, `quantities`
