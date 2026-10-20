# Whip Pan — `free-remotion-templates/whip-pan`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Цепочка полноэкранных сцен (фон + заголовок + подзаголовок), между которыми
камера резко «хлёстом» панорамирует вбок с сильным размытием движения.

## Когда использовать

Энергичная последовательность из 2+ тезисов: «открой — создай — доставь»,
этапы продукта, слоганы. Сцены уже приходят массивом props — ближе всех в
наборе к готовому компоненту. Для спокойной смены — `slide-wipe`.

## Фразы из озвучки

- «находим, создаём, доставляем»
- «три шага — и продукт готов»
- «быстро переносимся к следующему этапу»

## Визуальный стиль

Плоские цвета сцен (`#0f172a`, `#7c3aed`, `#ea580c`), заголовок 132 px weight
900, blur до 24 px. Динамичный, промо. 1920×1080, 120 кадров; шрифт
`-apple-system, "Segoe UI", Roboto, sans-serif`.

## Входные данные

`WhipPanProps`: `scenes: {background, title, subtitle?, textColor?}[]`
(≥2; по умолчанию Discover/Create/Deliver), `panLeft?` (true),
`maxBlur?` (24).

## Анимации

Длительность делится поровну на сцены (`durationInFrames / scenes.length`);
пан в последних 40 % сегмента, `Easing.inOut(cubic)`; `translateX` на ширину
кадра; `filter: blur` = `sin(π·progress)·maxBlur`. Последняя сцена держится.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/whip-pan/WhipPan.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion` (`interpolate`, `Easing`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`, сам перетаймится под длительность. Для произвольного контента
заменить `ScenePane` на `children[]`. Полноэкранный blur дорог в рендере.

## Паттерны

`sequence-steps`, `key-point-emphasis`
