# Four-Tone Titler — `free-remotion-templates/four-tone-mono-titler`

| Поле | Значение |
|---|---|
| Репозиторий | `free-remotion-templates` (`templates/remotion-components/free-remotion-templates`) |
| Вид | template |
| Категория | `layout-templates` |
| Совместимость с Remotion | native |
| Флаги | `svg` |
| Проверка | static-review |
| Лицензия | MIT (package.json, LICENSE, SPDX-заголовок в файле) |

## Что визуализирует

Пиксельная «плашка» нижней трети в стиле экрана карманной ретро-консоли
(строго 4 зелёных тона): панель с дизерингом по Байеру открывается жёстким
вайпом слева направо со «считывающей головкой», заголовок точечным
шрифтом 5×7, по нему затем бегает блик; сверху — мерцающая пиксельная пыль.

## Когда использовать

Ретро/геймерская подача: название уровня, этапа, эпизода, титр героя.
Для обычного lower third — не этот шаблон (стиль очень специфичный).

## Фразы из озвучки

- «уровень первый: тихое болото»
- «следующий этап нашего пути»
- «как в старых видеоиграх»

## Визуальный стиль

Внутреннее разрешение 480×270, апскейл с `image-rendering: pixelated`,
`shapeRendering: crispEdges`; палитра Game Boy-подобная (`#0f380f`…
`#9bbc0f`). Шрифт — собственный битмап 5×7 из `pixel-kit` (без
webfont, только латиница/цифры). 1920×1080, 120 кадров (4 с), 30 fps.

## Входные данные

`FourToneMonoTitlerProps`: `title` («LANTERN HOLLOW»), `subtitle` («STAGE
01 - THE QUIET MARSH»), `tone0`…`tone3` (hex из 4-тональной палитры),
`titleCell` (4), `subtitleCell` (2), `wipeFrames` (72), `shimmerSpeed`
(3.2), `ditherDensity` (0.6), `showAmbient` (true).

## Анимации

Край вайпа = `easeInOutCubic(frame/wipeFrames)·480`; всё на панели
отсекается по x < edge. Блик: `(frame·shimmerSpeed) % span`. Дизер-полоса
рябит `sin(px·0.045 + frame·0.05)`; «дыхание» свечения `sin(frame·0.03)`;
пыль — детерминированные `seed()/seed2()` из pixel-kit.

## Исходники и документация

- `templates/remotion-components/free-remotion-templates/src/components/four-tone-mono-titler/FourToneMonoTitler.tsx` — шаблон
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/index.ts` — реэкспорт pixel-kit
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/render.tsx` — `PixelStage` (апскейл)
- `templates/remotion-components/free-remotion-templates/src/pixel-kit/font.ts` — битмап-шрифт 5×7
- `templates/remotion-components/free-remotion-templates/README.md` — каталог

## Зависимости

`remotion` (`useCurrentFrame`, `useVideoConfig` через PixelStage),
внутренний `src/pixel-kit` (`PixelStage`, `layoutText`, `measureText`,
`seed`, `seed2`, `rgb`).

## Совместимость и адаптация

`native`: всё — функция кадра, случайность детерминирована. Копировать
вместе с `src/pixel-kit/`. Тысячи `<rect>` на кадр — рендер тяжелее
обычного. Кириллица битмап-шрифтом не поддерживается.

## Паттерны

`key-point-emphasis`, `sequence-steps`
