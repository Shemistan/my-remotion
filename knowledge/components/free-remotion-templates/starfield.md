# Starfield — `free-remotion-templates/starfield`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `particles-effects` |
| Совместимость с Remotion | native |
| Флаги | нет |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Варп-полёт: звёзды разлетаются радиально от центра, к краям растут,
ярчеют и вытягиваются в шлейфы со свечением; по центру — надпись.

## Когда использовать

Скорость, прорыв, «в космос», масштаб, будущее, переход к большой идее;
фон под заголовок. Для спокойного фона — bokeh-circles.

## Фразы из озвучки

- «на полной скорости вперёд»
- «выходим на новый уровень»
- «будущее ближе, чем кажется»

## Визуальный стиль

Почти чёрный фон `#02030a`, белые звёзды с `box-shadow`-свечением и
градиентным хвостом; динамично. Надпись 72 px, разрядка 8, системный
sans-serif. В Root: 1920×1080, 150 кадров.

## Входные данные

`StarfieldProps`: `count: number` (180), `starColor` (`#ffffff`),
`baseColor` (`#02030a`), `warpSpeed: number` (4), `label?` («BACKGROUND»),
`labelColor?` (`#ffffff`).

## Анимации

Звезда: угол, стартовое расстояние, размер, скорость — `seededRandom`
(детерминированно). Расстояние `(startOffset + frame*warpSpeed*jitter) %
maxR`; размер, opacity и длина шлейфа растут с расстоянием. Надпись fade 10–25.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/starfield/Starfield.tsx`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`.

## Совместимость и адаптация

`native`, адаптации не нужны. Рисуется div-ами (не SVG/Canvas): при
`count` в тысячи рендер замедлится.

## Паттерны

`abstract-concepts`, `transformation`, `spatial`
