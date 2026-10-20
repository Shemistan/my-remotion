# Pixel Mosaic Transition — `free-remotion-templates/pixel-mosaic-transition`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `transitions-scene` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

8-битный стингер: процедурная пиксельная сцена «день» (небо, солнце, земля)
укрупняется в мозаику блоков, на пике крупности с белой вспышкой меняется на
сцену «ночь» (луна-полумесяц, звёзды) и снова становится чёткой; поверх —
Bayer-дизеринг, CRT-сканлайны, шум, виньетка.

## Когда использовать

Ретро/геймерская смена состояния: «день и ночь», «до/после», загрузка
уровня. Сцены не произвольные — это цветовые поля `sceneField` (день/ночь),
задаются только цвета. Мозаика над произвольным видео/сценой этим кодом не
делается — нужна другая техника (Canvas-сэмплинг, это уже `complex`).

## Фразы из озвучки

- «переключаемся в ночной режим»
- «уровень пройден — загружаем следующий»
- «картинка рассыпается и собирается заново»

## Визуальный стиль

Пиксель-арт: внутреннее разрешение 480×270, апскейл nearest-neighbour;
тёплое `#ff8a3d`/`#fff0c2` → ночное `#1b2b66`/`#cfe0ff`, фон `#05060f`.
1920×1080, 90 кадров. Шрифтов нет.

## Входные данные

`PixelMosaicTransitionProps`: `backgroundColor` (`#05060f`), `screenAColor`
(`#ff8a3d`), `screenAAccent` (`#fff0c2`), `screenBColor` (`#1b2b66`),
`screenBAccent` (`#cfe0ff`), `maxCell` (48), `ditherOpacity` (0.08).

## Анимации

Размер блока 1→`maxCell`→1 (квадратичный ease-in-out) по расстоянию до
середины `DURATION_FRAMES/2`; переключение A→B на середине; линии швов при
крупных блоках; вспышка ±4 кадра; CRT-шум `feTurbulence` с `seed = frame % 64`.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/pixel-mosaic-transition/PixelMosaicTransition.tsx` — компонент
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts` — реэкспорт pixel-kit
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/render.tsx` — `PixelStage`
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/fx.tsx` — `PixelDither`, `Crt*`
- `templates/remotion-components/free-remotion-templates/README.md` — каталог шаблонов

## Зависимости

`remotion`, `react`, внутренний `src/pixel-kit` (копировать вместе с шаблоном).

## Совместимость и адаптация

`native`. Середина считается от константы `DURATION_FRAMES = 90`, а не от
`useVideoConfig()` — при другой длительности поправить. При `cell = 1`
рисуется ~130 тыс. `<rect>` (480×270) — первые/последние кадры тяжёлые.
SVG id `bayer4`/`px-noise` фиксированы.

## Паттерны

`transformation`, `comparison`
