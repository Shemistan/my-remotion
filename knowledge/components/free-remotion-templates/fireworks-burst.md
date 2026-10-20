# Fireworks Burst — `free-remotion-templates/fireworks-burst`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Три SVG-салюта на кадрах 0, 20 и 35: взлётный след, 12 цветных
«лепестков»-лучей с точками и 8 искр расходятся по кругу и гаснут; внизу
крупное слово и подпись.

## Когда использовать

Празднование, запуск, рекорд, юбилей, «мы достигли цели». Для фона без
события — bokeh-circles.

## Фразы из озвучки

- «мы это сделали!»
- «запуск состоялся»
- «отмечаем миллион пользователей»

## Визуальный стиль

Тёмный фон `#0f172a`, радужная палитра из 7 цветов, геометричные лучи
(не реалистичные частицы); системный sans-serif. В Root: 1080×1080, 110 кадров.

## Входные данные

`FireworksBurstProps`: `backgroundColor`, `burstColors: string[]` (7),
`trailColor`, `sparkColor`, `textColor`, `subColor`, `messageText`
(«Boom!»), `subText` («Celebration time»). Позиции и время залпов зашиты.

## Анимации

Для каждого залпа `localFrame`: радиус растёт линейно 30 кадров, след
виден первые 15 кадров, затухание после 50 за 30 кадров. Текст `spring`
scale с кадра 68, подпись fade 82–96.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/fireworks-burst/FireworksBurst.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, случайности нет — лучи распределены равномерно. Чтобы
«складывать залпы для финала», массив `bursts` надо вынести в props.

## Паттерны

`key-point-emphasis`, `growth-decline`
