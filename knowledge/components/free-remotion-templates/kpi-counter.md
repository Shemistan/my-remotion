# KPI Counter — `free-remotion-templates/kpi-counter`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `numbers-counters` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Дашборд из карточек KPI: заголовок и подзаголовок, рисующаяся линия-
разделитель, затем по очереди въезжают карточки; в каждой — значок, подпись,
и число, которое докручивается «одометром» (барабаны цифр, старший разряд
поворачивается только при переходе младшего 9→0), с префиксом/суффиксом и
цветной полосой слева.

## Когда использовать

Итоги периода: 2–4 метрики (выручка, рост, клиенты, NPS). Сокращение до
K/M выбирается автоматически по итоговому значению. Для одной крупной цифры
— взять `remotion-bits/animated-counter`; для сравнения категорий — `bar-chart-anim`.

## Фразы из озвучки

- «итоги квартала в четырёх цифрах»
- «выручка — 2,8 миллиона, рост — 127 процентов»
- «у нас уже 384 клиента»
- «NPS достиг 72»

## Визуальный стиль

Тёмный slate (`#0f172a`, карточки `#1e293b`), индиго-акцент `#6366f1`,
радиальное свечение сверху, жирные табличные цифры. Бизнес-дашборд.
1920×1080, 120 кадров; шрифт `-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`KpiCounterProps`: `backgroundColor`, `cardColor`, `textColor` (`#f8fafc`),
`subtextColor` (`#94a3b8`), `accentColor`, `title` («Q4 Results»),
`subtitle` («2024 Performance»), `metrics: {label, value, prefix, suffix,
decimals, color, icon}[]` (Revenue 2 840 000 $, Growth +127 %, Clients 384,
NPS Score 72).

## Анимации

Заголовок `spring` (damping 14) + y; разделитель кадры 10–28; карточки
`spring` (damping 12, stiffness 100, 22 кадра) со stagger 8 от кадра 14,
slide-x −40→0; счёт с 6 по 55 кадр после появления карточки
`Easing.out(cubic)`; полоса `scaleY` 0→1. 4 колонки в горизонтальном
кадре, 2 — в вертикальном/квадратном.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/kpi-counter/KpiCounter.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`spring`, `interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`, без адаптаций. Разделитель разрядов (пробел/запятая) не
выводится; `icon` — один символ/эмодзи (эмодзи зависят от шрифтов системы).

## Паттерны

`quantities`, `growth-decline`, `key-point-emphasis`
