# Pixel Waterfall — `free-remotion-templates/pixel-waterfall-cycle`

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

Пиксель-арт водопад в вертикальном кадре: полосатое небо, скалы по бокам,
падающая вода «течёт» за счёт ротации палитры (color cycling в стиле
Amiga), брызги и туман у озера, поверх — CRT-скин (сканлайны, шум,
виньетка, дизеринг). Петля.

## Когда использовать

Ретро/игровая эстетика, фон для вертикального ролика, лирик-видео, спокойная
пауза, тема «поток», «течение времени». Не для делового контента.

## Фразы из озвучки

- «время течёт незаметно»
- «как в старых добрых играх»
- «поток не останавливается ни на секунду»

## Визуальный стиль

Внутреннее разрешение 360×640, апскейл nearest-neighbour
(`image-rendering: pixelated`, `shape-rendering: crispEdges`), палитра
`WATER_RAMP`, тёмно-синее небо. Текста нет. В Root: 1080×1920, 180 кадров.

## Входные данные

`PixelWaterfallCycleProps`: `backgroundColor` (`#0a1430`, верх неба),
`accentColor` (`#e6fbff`, пена), `cliffColor` (`#1a2238`), `cycleSpeed:
number` (0.2), `showMist: boolean` (true).

## Анимации

Полосы воды (шаг 3 px) красятся `cyclePalette(frame, y*0.16, cycleSpeed*0.06,
WATER_RAMP)` — фаза по Y даёт эффект падения. Светлые прожилки
`sin(y*0.4 + frame*0.5 + i)`. Брызги и туман — `particleField` (dir −1).
`CrtNoise` — `feTurbulence` с `seed = frame % 64`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/pixel-waterfall-cycle/PixelWaterfallCycle.tsx`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts` — общий модуль (`free-remotion-templates/pixel-kit`)
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion`, `react`, внутренний `src/pixel-kit/` (PixelStage, SkyBands,
PixelDither, Crt*, cyclePalette, particleField).

## Совместимость и адаптация

`native`: всё детерминировано (хэш на `Math.sin`, без `Math.random`). При
копировании переносить и `src/pixel-kit/`. Бесшовность петли заявлена в
комментарии, но покадрово не проверялась.

## Паттерны

`abstract-concepts`, `timeline`
