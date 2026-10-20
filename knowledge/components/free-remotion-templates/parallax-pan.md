# Parallax Pan — `free-remotion-templates/parallax-pan`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `backgrounds-gradients` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Векторный пейзаж из слоёв: градиентное небо, солнце, дальние горы,
средние холмы, передний план и ёлки. Слои едут влево с разной скоростью
(параллакс), поверх — неподвижный заголовок с подзаголовком.

## Когда использовать

Путешествие, путь, «впереди горизонт», переход к новой главе, вступление
с ощущением глубины. Для абстрактного фона — bokeh/grid.

## Фразы из озвучки

- «впереди долгий путь»
- «за горизонтом — новые возможности»
- «отправляемся в путешествие»

## Визуальный стиль

Закатное небо `#1e3a8a → #f59e0b`, тёмные силуэты гор, кремовый текст
108 px weight 900 с тенью; кинематографично и спокойно. Системный
sans-serif. В Root: 1920×1080, 120 кадров.

## Входные данные

`ParallaxPanProps`: `title` («Beyond the Horizon»), `subtitle?`, `skyTop`,
`skyBottom`, `mountainColor`, `hillColor`, `groundColor`, `textColor`,
`panDistance?: number` (600). Цвета ёлок зашиты.

## Анимации

`t = frame / durationInFrames` (линейно); смещения слоёв `-t*panDistance*k`
при k = 0.15 / 0.45 / 1.0 / 1.3, солнце 0.045. Текст: fade + y 40→0 на
10–28 (`Easing.out(cubic)`). Высоты пиков — детерминированный `seededHeight`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/parallax-pan/ParallaxPan.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, адаптации не нужны. Слои шириной 3×кадр — при большом
`panDistance` (> 2×ширины) край слоя может показаться.

## Паттерны

`spatial`, `transformation`, `timeline`
