# pixel-kit — `free-remotion-templates/pixel-kit`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | util |
| Категория | `utilities` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Собственной картинки нет: общий модуль шести pixel-art шаблонов
(`src/pixel-kit/`). Даёт рендер в низком внутреннем разрешении с чётким
апскейлом, ротацию палитр, детерминированные частицы, битмап-шрифт 5×7 и
CRT-оверлеи.

## Когда использовать

Нужна ретро/8-бит стилистика в любой своей сцене: водопад, неон, дождь,
огонь, synthwave-сетка, текст «как в игре». Для обычной графики не нужен.

## Фразы из озвучки

- «как в восьмибитных играх девяностых»
- «ретро-экран старого монитора»
- «пиксель за пикселем»

## Визуальный стиль

Пиксельная чёткость (`image-rendering: pixelated`, `crispEdges`), палитры
NEON/WATER/LAVA/AURORA… и GameBoy/PICO-8, сканлайны и виньетка.

## Входные данные

Экспорт из `index.ts` (реэкспорт `font`, `fx`, `palette`, `particles`,
`render`):
- `render.tsx`: `PixelStage {iw, ih, background?, zoom?, children}`,
  `SkyBands`, `GridFloor {iw, ih, horizon, frame, pulse?, ramp?, rows?, cols?,
  columns?}`, `computePulse(beats, frame)`, `idlePulse(frame, fps, bpm)`, `idleBeats`.
- `palette.ts`: `cyclePalette(frame, phase, speed=0.06, ramp)`,
  `cyclePaletteLocked`, `lerpRGB`, `rgb`, 18 ramp-ов + `RAMPS`.
- `particles.ts`: `particleField({count, w, h, frame, speed, swayAmp, dir,
  layerSeed…})`, `starField`, `starBrightness`, хэши `seed`/`seed2`.
- `fx.tsx`: `BitmapText`, `PixelBeatFlash`, `PixelSparkle`, `PixelDither`,
  `CrtScanlines`, `CrtVignette`, `CrtNoise`, `ChromaShift`, `ApertureGrille`.
- `font.ts`: глифы 5×7 (A–Z, a–z, 0–9, пунктуация), `layoutText`, `measureText`.

## Анимации

Всё — функции от `frame`: ротация палитры по фазе, падение/подъём частиц по
модулю, бит-пульс attack/decay, шум `feTurbulence seed = frame % 64`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/render.tsx`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/palette.ts`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/particles.ts`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/fx.tsx`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/font.ts`
- `templates/remotion-components/free-remotion-templates/README.md`

## Зависимости

`remotion` (`AbsoluteFill`, `useCurrentFrame`, `useVideoConfig`), `react`.

## Совместимость и адаптация

`native`: явно без `Math.random`/`Date`, без внешних шрифтов и CDN. Фиксированные
id SVG (`bayer4`, `px-noise`) — при нескольких экземплярах возможны коллизии.
Японский/кириллица битмап-шрифтом не покрыты — нужен системный шрифт.

## Паттерны

`abstract-concepts`
