# Grid Wave Loop — `free-remotion-templates/loop-grid-wave`

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

Сетка 18×12 SVG-точек, по которой бежит диагональная волна: точки
увеличиваются и светлеют, на гребне перекрашиваются в акцентный цвет.
Бесшовная петля.

## Когда использовать

Технологичная подложка: данные, сеть, ИИ, поток сигналов; фон под
заголовок или инфографику. Для тёплой атмосферы — bokeh-circles.

## Фразы из озвучки

- «данные проходят через всю систему»
- «сигнал распространяется по сети»
- «тысячи точек работают синхронно»

## Визуальный стиль

Почти чёрный синий фон `#0a0f1e`, серые точки `#334155`, голубой гребень
`#38bdf8`; гипнотичный, ровный темп. Текста нет. В Root: 1920×1080, 90 кадров.

## Входные данные

`LoopGridWaveProps`: `backgroundColor` (`#0a0f1e`), `dotColor` (`#334155`),
`accentColor` (`#38bdf8`), `amplitude: number` (1.0), `speed: number` (1.0).

## Анимации

`t = frame / DURATION_FRAMES * 2π * speed`; волна
`sin(t + col*0.38 + row*0.48)` → радиус (20–100 % от max) и opacity; цвет
меняется при `wave > 0.7`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/loop-grid-wave/LoopGridWave.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`. Петля бесшовна только при целом `speed` и длительности,
равной константе `DURATION_FRAMES = 90`; при другой длине подставить
`durationInFrames` из `useVideoConfig`.

## Паттерны

`system-structure`, `relationships`, `abstract-concepts`
